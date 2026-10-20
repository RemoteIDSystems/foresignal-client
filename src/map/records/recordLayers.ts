import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  EllipsoidGeodesic,
  GeometryInstance,
  GroundPolylineGeometry,
  Math as CesiumMath,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  PolylineColorAppearance,
  PolylineGeometry,
  type Billboard,
  type Viewer,
} from 'cesium';
import type { StyleModel } from '../style/model';
import type { RecordFeature } from './decodeTile';
import { resolveSymbol, type LineSymbol } from './featureStyle';
import {
  aggregationFor,
  cellsOfTile,
  DEFAULT_AGGREGATION,
  HexCellIndex,
  rampColor,
  type HexCell,
} from './hexCells';
import type { LayerSources } from './layerSources';
import type { RecordBatch } from './recordBatch';
import { RecordClaims, recordId, shownRecords } from './recordFilter';
import {
  compareHits,
  hitTest,
  ringBox,
  tileMayHold,
  type Pickable,
  type PickQuery,
  type RecordHit,
  type RecordPickId,
} from './recordPicking';
import type { SymbolImages } from './symbolImages';
import type { LayerTiles, TileAggregation } from './tileSource';
import { visibleRectangle } from '../view';
import { planTiles, tileKey, zoomForResolution, type GeoRect, type TileId } from './tileMath';

/** Most tiles one layer requests for a view; the tile zoom steps down beyond it. */
export const MAX_TILES_PER_LAYER = 48;

/** Most tile requests one layer keeps queued in the shared request queue. */
const MAX_IN_FLIGHT = 6;

/** The first wait before asking again after the backend rate limited or was busy, in ms. */
const RETRY_BASE_MS = 1_000;

/** The longest such wait, in ms. */
const RETRY_MAX_MS = 30_000;

/** What the map shows of a layer, for the rail and for tests. */
export interface RecordLayerStatus {
  /**
   * `loading` while the TileJSON or tiles for the view are in flight; `ready` when the view's
   * records are drawn; `aggregated` when the view is below the layer's `aggBelowZoom` and its
   * hexagon counts are drawn instead; `error` when the layer cannot load.
   */
  state: 'loading' | 'ready' | 'aggregated' | 'error';
  /** Records drawn now, one by one (0 while aggregated). */
  features: number;
  /** Tiles drawn now. */
  tiles: number;
  /** Hexagon cells drawn now, below `aggBelowZoom`. */
  cells?: number;
  /** Records the drawn cells count together. */
  aggregated?: number;
  /** Why the layer failed, for `error`. */
  message?: string;
}

/** The view a layer draws for: its rectangle and map zoom. */
export interface RecordView {
  /** Undefined when the view shows the whole globe or space around it. */
  rect: GeoRect | undefined;
  /** MapLibre map zoom at the view center (512-pixel tiles). */
  zoom: number;
}

/** What a layer needs from the map to draw: shared by every layer on the viewer. */
export interface RecordLayerContext {
  /** TileJSON, tiles and the request queue. */
  sources: LayerSources;
  /** The primitives every layer draws into. */
  batch: RecordBatch;
  model: StyleModel;
  images: SymbolImages;
}

/** The prefix of an aggregate tile's key, so it never collides with the same tile's records. */
const HEX_KEY = 'hex:';

/** One drawn tile: its billboards in the shared collection, and its records for picking. */
interface DrawnTile {
  billboards: Billboard[];
  /** Whether it put lines or fills into the shared ground primitives. */
  ground: boolean;
  features: number;
  /** The tile's decoded records, kept so a source filter change redraws without refetching. */
  records: RecordFeature[];
  /** The records drawn, as picking tests them. */
  pickables: Pickable[];
  /** The zoom it was drawn for. */
  zoom: number;
}

/**
 * One backend record layer on the map, drawn from its vector tiles (`getTileJson`, `getTile`)
 * into the viewer's shared {@link RecordBatch}: every point is a billboard in the one collection
 * all layers share (one texture per distinct symbol), and every line, outline and fill joins the
 * merged ground primitives, so there is never a Cesium `Entity`, a DOM node, or even a primitive per
 * record or per tile. In 3D, points are clamped to the terrain and depth-tested against the globe,
 * so they sit on the raised relief and hide behind the Earth; the same records draw in 2D. Tiles for a
 * new view load before the old view's tiles are removed, so panning does not blink. TileJSON and
 * tiles come from the shared {@link LayerSources}, so a layer turned off and on again draws from
 * memory. Picking ({@link pick}) tests only the records of the tiles under the pointer.
 */
export class RecordLayer {
  private readonly drawn = new Map<string, DrawnTile>();
  private readonly inFlight = new Map<string, AbortController>();
  private queue: TileId[] = [];
  private wanted = new Set<string>();
  private tiles?: LayerTiles;
  private tileJson?: Promise<LayerTiles | undefined>;
  private view?: RecordView;
  private destroyed = false;
  private failure?: string;
  private hiddenSources: ReadonlySet<string> = new Set();
  private readonly claims = new RecordClaims();
  private readonly cells = new HexCellIndex();
  /** The merged cells drawn now, with their boxes, for picking. */
  private cellPickables: { pickable: Pickable; box: [number, number, number, number] }[] = [];
  private cellsDrawn = { cells: 0, records: 0 };
  private cellTimer?: ReturnType<typeof setTimeout>;
  /** The last status reported, to report only changes. */
  private lastStatus?: string;
  /** Whether the queued tiles are aggregate tiles. */
  private queueHex = false;
  /** A pending retry after a transient failure, and how many in a row there have been. */
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retries = 0;

  /**
   * @param id The layer id (`listTileLayers`: a source id or a kind).
   * @param context The shared sources, batch, style model and symbol images.
   * @param onStatus Told each time what the layer shows changes.
   */
  constructor(
    readonly id: string,
    private readonly context: RecordLayerContext,
    private readonly onStatus: (status: RecordLayerStatus) => void = () => {},
  ) {}

  /** Draws the layer for a view: loads the tiles it needs and drops the ones it no longer does. */
  update(view: RecordView): void {
    this.view = view;
    if (this.destroyed) return;
    if (!this.tiles) {
      this.tileJson ??= this.loadTileJson();
      void this.tileJson.then((tiles) => {
        if (tiles && this.view) this.plan(this.view);
      });
      this.report();
      return;
    }
    this.plan(view);
  }

  /**
   * Hides the records of these sources (the FILTERS tab) and redraws the tiles already loaded
   * with the new filter; nothing is fetched again.
   */
  setHiddenSources(hidden: ReadonlySet<string>): void {
    if (sameSet(hidden, this.hiddenSources)) return;
    this.hiddenSources = new Set(hidden);
    if (this.destroyed) return;
    // Cells count every source together, so the filter does not reach them.
    for (const [key, tile] of [...this.drawn]) {
      if (!key.startsWith(HEX_KEY)) this.drawTile(key, tile.records, tile.zoom);
    }
    this.report();
  }

  /**
   * The layer's records under the pointer, topmost first. Only the tiles that may hold a hit
   * ({@link tileMayHold}) are tested, and below the aggregation zoom the merged cells.
   */
  pick(query: PickQuery): RecordHit[] {
    const hits: RecordHit[] = [];
    for (const [key, tile] of this.drawn) {
      if (key.startsWith(HEX_KEY) || !tileMayHold(key, query)) continue;
      for (const pickable of tile.pickables) {
        const hit = hitTest(pickable, query);
        if (hit) hits.push(hit);
      }
    }
    for (const { pickable, box } of this.cellPickables) {
      const [west, south, east, north] = box;
      if (query.latitude < south || query.latitude > north) continue;
      if (east - west < 180 && (query.longitude < west || query.longitude > east)) continue;
      const hit = hitTest(pickable, query);
      if (hit) hits.push(hit);
    }
    return hits.sort(compareHits);
  }

  /** Removes everything the layer drew and cancels its requests. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const controller of this.inFlight.values()) controller.abort();
    this.inFlight.clear();
    clearTimeout(this.retryTimer);
    const { batch } = this.context;
    for (const tile of this.drawn.values()) {
      for (const billboard of tile.billboards) batch.points.remove(billboard);
    }
    this.drawn.clear();
    batch.lines.deletePrefix(this.ownerPrefix);
    batch.fills.deletePrefix(this.ownerPrefix);
    batch.cellFills.delete(this.id);
    batch.cellLines.delete(this.id);
    clearTimeout(this.cellTimer);
  }

  /** Records drawn now (for tests and the status). */
  get featureCount(): number {
    let total = 0;
    for (const tile of this.drawn.values()) total += tile.features;
    return total;
  }

  /** Hexagon cells drawn now. */
  get cellCount(): number {
    return this.cellsDrawn.cells;
  }

  /** True while the layer waits for its TileJSON or for tiles of the view. */
  get loading(): boolean {
    if (this.failure) return false;
    return (
      !this.tiles ||
      this.inFlight.size > 0 ||
      this.queue.length > 0 ||
      this.retryTimer !== undefined
    );
  }

  /** Tiles drawn now. */
  get tileCount(): number {
    return this.drawn.size;
  }

  /** How this layer's tiles are named as owners in the shared ground primitives. */
  private get ownerPrefix(): string {
    return `${this.id}|`;
  }

  /** Reads the layer's TileJSON (shared) for its template, zoom range, bounds and aggregation. */
  private async loadTileJson(): Promise<LayerTiles | undefined> {
    const result = await this.context.sources.layerTiles(this.id);
    if (this.destroyed) return undefined;
    if (!result.ok) {
      this.tileJson = undefined;
      // Rate limited or busy: asked for again shortly. Otherwise on a later view, once the
      // shared cache lets it.
      if (result.transient) this.retryLater();
      else this.fail(result.message);
      return undefined;
    }
    this.failure = undefined;
    this.retries = 0;
    this.tiles = result.tiles;
    return this.tiles;
  }

  /** True when the view is below the layer's aggregation zoom, where it is drawn as cells. */
  private aggregating(view: RecordView | undefined): boolean {
    const below = this.tiles?.aggBelowZoom;
    return below !== undefined && view !== undefined && Math.floor(view.zoom) < below;
  }

  /**
   * Works out the tiles a view needs, starts loading the missing ones and tidies up. Below the
   * layer's `aggBelowZoom` these are `agg=hex` tiles of hexagon counts, planned below that zoom;
   * at or above it, record tiles (`agg=none`), never planned below it. The tiles of the other
   * mode stay until the new ones are in, so crossing the zoom does not blink.
   */
  private plan(view: RecordView): void {
    const tiles = this.tiles;
    if (!tiles || this.destroyed) return;
    const hex = this.aggregating(view);
    const below = tiles.aggBelowZoom;
    const needed = planTiles({
      rect: view.rect,
      zoom: view.zoom,
      minzoom: hex ? tiles.minzoom : Math.max(tiles.minzoom, below ?? 0),
      maxzoom: hex && below !== undefined ? Math.min(tiles.maxzoom, below - 1) : tiles.maxzoom,
      bounds: tiles.bounds,
      maxTiles: MAX_TILES_PER_LAYER,
    });
    const keyOf = (tile: TileId) => (hex ? HEX_KEY : '') + tileKey(tile);
    this.wanted = new Set(needed.map(keyOf));
    for (const [key, controller] of this.inFlight) {
      if (!this.wanted.has(key)) {
        controller.abort();
        this.inFlight.delete(key);
      }
    }
    this.queue = needed.filter((tile) => {
      const key = keyOf(tile);
      return !this.drawn.has(key) && !this.inFlight.has(key);
    });
    this.queueHex = hex;
    this.pump();
    this.settle();
  }

  /** Starts queued tile requests up to the layer's limit. */
  private pump(): void {
    while (this.inFlight.size < MAX_IN_FLIGHT && this.queue.length > 0) {
      const tile = this.queue.shift()!;
      void this.loadTile(
        tile,
        this.queueHex ? 'hex' : this.tiles?.aggBelowZoom !== undefined ? 'none' : undefined,
      );
    }
    this.report();
  }

  /**
   * Fetches (or takes from the shared cache), decodes and draws one tile: records, or with `agg`
   * `hex` the hexagon counts. A layer that aggregates asks for its record tiles with `agg=none`, so
   * they are records whatever the backend's `auto` would choose.
   */
  private async loadTile(tile: TileId, agg?: TileAggregation): Promise<void> {
    const key = (agg === 'hex' ? HEX_KEY : '') + tileKey(tile);
    const tiles = this.tiles!;
    const controller = new AbortController();
    this.inFlight.set(key, controller);
    try {
      const result = await this.context.sources.tile(tiles.template, tile, controller.signal, agg);
      if (this.destroyed || controller.signal.aborted) return;
      if (result.status === 'missing') {
        this.fail(result.message);
      } else if (result.status === 'failed') {
        if (result.transient) this.retryLater();
        else console.warn(`ForeSignal: tile ${this.id} ${key} failed (${result.message}).`);
      } else {
        this.retries = 0;
        if (this.wanted.has(key)) this.drawTile(key, result.features, this.view?.zoom ?? tile.z);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        console.warn(`ForeSignal: tile ${this.id} ${key} failed.`, cause);
    } finally {
      if (this.inFlight.get(key) === controller) this.inFlight.delete(key);
      if (!this.destroyed) {
        this.pump();
        this.settle();
      }
    }
  }

  /**
   * Draws the view again after the backend rate limited or was busy, which brings back the TileJSON
   * or the tiles that failed. The wait doubles with each failure in a row (from
   * {@link RETRY_BASE_MS} to {@link RETRY_MAX_MS}) and is jittered, so a full catalog of layers
   * turned on together does not ask again all at once. The layer reports `loading` meanwhile.
   */
  private retryLater(): void {
    if (this.retryTimer !== undefined || this.destroyed) return;
    const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.retries++);
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = undefined;
        if (this.view) this.update(this.view);
      },
      wait * (0.5 + Math.random()),
    );
    this.report();
  }

  /** Once nothing the view wants is pending, removes the tiles of earlier views. */
  private settle(): void {
    if (this.queue.length > 0 || this.inFlight.size > 0) return;
    for (const key of [...this.drawn.keys()]) if (!this.wanted.has(key)) this.removeTile(key);
    this.report();
  }

  /**
   * Draws a decoded tile's records into the shared batch; an aggregate tile joins the layer's
   * cells instead.
   */
  private drawTile(key: string, features: RecordFeature[], zoom: number): void {
    if (this.drawn.has(key)) this.removeTile(key, true);
    if (key.startsWith(HEX_KEY)) {
      this.cells.set(key, cellsOfTile(features));
      this.drawn.set(key, {
        billboards: [],
        ground: false,
        features: 0,
        records: features,
        pickables: [],
        zoom,
      });
      this.scheduleCells();
      return;
    }
    const { model, images, batch } = this.context;
    const billboards: Billboard[] = [];
    const pickables: Pickable[] = [];
    const lines: GeometryInstance[] = [];
    const fills: GeometryInstance[] = [];
    let count = 0;
    for (const feature of shownRecords(features, this.hiddenSources)) {
      const { properties, geometry } = feature;
      const symbol = resolveSymbol(model, feature.layer, properties, geometry.type, zoom);
      if (!symbol) continue;
      // A point record two tiles both carry is drawn by the first only.
      const record = geometry.type === 'point' ? recordId(properties) : undefined;
      if (record !== undefined && !this.claims.claim(record, key)) continue;
      const id: RecordPickId = {
        layer: this.id,
        source: stringProperty(properties.source),
        externalId: stringProperty(properties.externalId),
        kind: stringProperty(properties.kind),
      };
      const title = stringProperty(properties.title);
      count++;
      if (symbol.type === 'point' && geometry.type === 'point') {
        const image = images.imageFor(symbol.point);
        if (!image) continue;
        for (const [lon, lat] of geometry.points) {
          const billboard = batch.points.add({
            position: Cartesian3.fromDegrees(lon, lat),
            heightReference: batch.heightReference,
            width: image.width,
            height: image.height,
            id,
          });
          billboard.setImage(image.key, image.canvas);
          const point = symbol.point;
          if (point.type === 'icon' && point.rotation !== undefined) {
            billboard.rotation = -CesiumMath.toRadians(point.rotation);
            // North-aligned: the heading is measured from north as the map turns.
            if (point.rotationAlignment !== 'viewport') billboard.alignedAxis = Cartesian3.UNIT_Z;
          }
          billboards.push(billboard);
          pickables.push({
            id,
            title,
            shape: { type: 'point', at: [lon, lat], width: image.width, height: image.height },
          });
        }
      } else if (symbol.type === 'line' && geometry.type === 'line') {
        for (const line of geometry.lines) addLine(lines, line, symbol.line, id);
        pickables.push({
          id,
          title,
          shape: { type: 'line', lines: geometry.lines, width: symbol.line.width },
        });
      } else if (symbol.type === 'polygon' && geometry.type === 'polygon') {
        for (const polygon of geometry.polygons) {
          const [outer, ...holes] = polygon;
          if (!outer) continue;
          if (symbol.fill) {
            const color = Color.fromCssColorString(symbol.fill.color).withAlpha(
              symbol.fill.opacity,
            );
            fills.push(
              new GeometryInstance({
                geometry: new PolygonGeometry({
                  polygonHierarchy: new PolygonHierarchy(
                    positions(outer),
                    holes.map((hole) => new PolygonHierarchy(positions(hole))),
                  ),
                  // Tile geometry is Web Mercator: a straight edge there is a rhumb line.
                  arcType: ArcType.RHUMB,
                }),
                attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
                id,
              }),
            );
          }
          if (symbol.outline) for (const ring of polygon) addLine(lines, ring, symbol.outline, id);
        }
        pickables.push({ id, title, shape: { type: 'polygon', polygons: geometry.polygons } });
      }
    }
    const owner = this.ownerPrefix + key;
    batch.lines.set(owner, lines);
    batch.fills.set(owner, fills);
    this.drawn.set(key, {
      billboards,
      ground: lines.length + fills.length > 0,
      features: count,
      records: features,
      pickables,
      zoom,
    });
  }

  /**
   * Removes one drawn tile. Other tiles of its zoom that were refused one of its records (see
   * {@link RecordClaims}) are drawn again to take them, unless `keepWaiting`, when the tile is
   * about to be drawn again itself.
   */
  private removeTile(key: string, keepWaiting = false): void {
    const tile = this.drawn.get(key);
    if (!tile) return;
    const { batch } = this.context;
    for (const billboard of tile.billboards) batch.points.remove(billboard);
    if (tile.ground) {
      batch.lines.delete(this.ownerPrefix + key);
      batch.fills.delete(this.ownerPrefix + key);
    }
    const waiting = this.claims.release(key);
    if (this.cells.delete(key)) this.scheduleCells();
    this.drawn.delete(key);
    if (keepWaiting || this.destroyed) return;
    for (const other of waiting) {
      const drawn = this.drawn.get(other);
      if (drawn) this.drawTile(other, drawn.records, drawn.zoom);
    }
  }

  /** Redraws the merged cells once the current burst of tiles has landed. */
  private scheduleCells(): void {
    clearTimeout(this.cellTimer);
    this.cellTimer = setTimeout(() => this.drawCells(), CELL_REDRAW_MS);
  }

  /**
   * Hands every cell of the layer, merged across tiles ({@link HexCellIndex}), to the shared cell
   * primitives, colored by count on the kind's aggregation ramp from the overlay style. Cells are
   * ordinary primitives at the ellipsoid, not ground primitives: the scene does not depth-test
   * primitives against terrain, so they draw over the relief, and ground primitives' shadow volumes
   * cost far more per frame over the large areas cells cover. The batch keeps the cells drawn before
   * until the new ones are ready, so a redraw does not blink.
   */
  private drawCells(): void {
    if (this.destroyed) return;
    const merged = this.cells.merged();
    const style = aggregationFor(this.context.model, this.id) ?? DEFAULT_AGGREGATION;
    const opacity = style.opacity ?? 0.6;
    const outline = Color.fromCssColorString(style.outlineColor ?? '#FFFFFF').withAlpha(opacity);
    const fills: GeometryInstance[] = [];
    const lines: GeometryInstance[] = [];
    const pickables: typeof this.cellPickables = [];
    let records = 0;
    for (const cell of merged) {
      records += cell.count;
      const id: RecordPickId = { layer: this.id, kind: this.id, count: cell.count };
      const color = Color.fromCssColorString(rampColor(style.ramp, cell.count)).withAlpha(opacity);
      fills.push(cellFill(cell, color, id));
      lines.push(cellOutline(cell, outline, id));
      pickables.push({
        pickable: { id, shape: { type: 'cell', ring: cell.ring } },
        box: ringBox(cell.ring),
      });
    }
    this.context.batch.cellFills.set(this.id, fills);
    this.context.batch.cellLines.set(this.id, lines);
    this.cellPickables = pickables;
    this.cellsDrawn = { cells: merged.length, records };
    this.report();
  }

  /** Marks the layer failed. */
  private fail(message: string): void {
    this.failure = message;
    console.warn(`ForeSignal: layer ${this.id}: ${message}`);
    this.report();
  }

  /** Tells the owner what the layer shows now. */
  private report(): void {
    const features = this.featureCount;
    const tiles = this.drawn.size;
    let state: RecordLayerStatus['state'];
    if (this.failure) state = 'error';
    else if (this.loading) state = 'loading';
    else if (this.aggregating(this.view)) state = 'aggregated';
    else state = 'ready';
    const status: RecordLayerStatus = { state, features, tiles };
    if (this.cellsDrawn.cells > 0) {
      status.cells = this.cellsDrawn.cells;
      status.aggregated = this.cellsDrawn.records;
    }
    if (this.failure) status.message = this.failure;
    // Told only of a change: each status re-renders the rail and the map's overlays.
    const signature = JSON.stringify(status);
    if (signature === this.lastStatus) return;
    this.lastStatus = signature;
    this.onStatus(status);
  }
}

/** Adds one line (or ring) as a ground polyline instance; skips lines with fewer than two points. */
function addLine(
  out: GeometryInstance[],
  coordinates: [number, number][],
  symbol: LineSymbol,
  id: RecordPickId,
): void {
  if (coordinates.length < 2) return;
  out.push(
    new GeometryInstance({
      geometry: new GroundPolylineGeometry({
        positions: positions(coordinates),
        width: Math.max(1, symbol.width),
        arcType: ArcType.RHUMB,
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(symbol.color)),
      },
      id,
    }),
  );
}

/** How long a burst of aggregate tiles may take to land before the cells are redrawn, in ms. */
const CELL_REDRAW_MS = 60;

/** One cell's fill, on the ellipsoid. */
function cellFill(cell: HexCell, color: Color, id: RecordPickId): GeometryInstance {
  return new GeometryInstance({
    geometry: new PolygonGeometry({
      polygonHierarchy: new PolygonHierarchy(positions(cell.ring)),
      arcType: ArcType.RHUMB,
      vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
    }),
    attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
    id,
  });
}

/** One cell's outline, on the ellipsoid, one pixel wide. */
function cellOutline(cell: HexCell, color: Color, id: RecordPickId): GeometryInstance {
  return new GeometryInstance({
    geometry: new PolylineGeometry({
      positions: positions(cell.ring),
      width: 1,
      arcType: ArcType.RHUMB,
      vertexFormat: PolylineColorAppearance.VERTEX_FORMAT,
    }),
    attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
    id,
  });
}

/** Degrees to Cartesian positions on the ellipsoid. */
function positions(coordinates: [number, number][]): Cartesian3[] {
  return Cartesian3.fromDegreesArray(coordinates.flat());
}

/** True when two sets hold the same members. */
function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((member) => b.has(member));
}

/** A string property, or undefined. */
function stringProperty(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Pixels apart the two points sampled for the view's ground resolution. */
const RESOLUTION_SAMPLE_PIXELS = 100;

/**
 * The view the record layers draw for: the visible rectangle ({@link visibleRectangle}) and the map
 * zoom at the center of the canvas (from the ground distance between two points across the
 * center). In 3D, when the center of the canvas shows space, the zoom is 0 and the whole globe is
 * the rectangle.
 */
export function readRecordView(viewer: Viewer): RecordView {
  const { camera, scene } = viewer;
  const ellipsoid = scene.globe.ellipsoid;
  const width = scene.canvas.clientWidth;
  const height = scene.canvas.clientHeight;
  const y = height / 2;
  const left = camera.pickEllipsoid(
    new Cartesian2(width / 2 - RESOLUTION_SAMPLE_PIXELS / 2, y),
    ellipsoid,
  );
  const right = camera.pickEllipsoid(
    new Cartesian2(width / 2 + RESOLUTION_SAMPLE_PIXELS / 2, y),
    ellipsoid,
  );
  if (!left || !right) return { rect: undefined, zoom: 0 };
  const a = ellipsoid.cartesianToCartographic(left);
  const b = ellipsoid.cartesianToCartographic(right);
  const meters = new EllipsoidGeodesic(a, b, ellipsoid).surfaceDistance;
  const latitude = CesiumMath.toDegrees((a.latitude + b.latitude) / 2);
  const zoom = zoomForResolution(meters / RESOLUTION_SAMPLE_PIXELS, latitude);
  return { rect: visibleRectangle(viewer), zoom };
}
