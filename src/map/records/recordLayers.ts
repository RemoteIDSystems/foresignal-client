import {
  ArcType,
  BillboardCollection,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  EllipsoidGeodesic,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  GroundPrimitive,
  HeightReference,
  Math as CesiumMath,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  PolylineColorAppearance,
  type Billboard,
  type Scene,
  type Viewer,
} from 'cesium';
import type { ForesignalClient } from '../../api/client';
import type { StyleModel } from '../style/model';
import type { RecordFeature } from './decodeTile';
import { resolveSymbol, type LineSymbol } from './featureStyle';
import type { SymbolImages } from './symbolImages';
import { fetchTile, loadLayerTiles, type LayerTiles } from './tileSource';
import { visibleRectangle } from '../view';
import { planTiles, tileKey, zoomForResolution, type GeoRect, type TileId } from './tileMath';

/** Most tiles one layer requests for a view; the tile zoom steps down beyond it. */
export const MAX_TILES_PER_LAYER = 48;

/** Most tile requests one layer keeps in flight. */
const MAX_IN_FLIGHT = 6;

/** What the map shows of a layer, for the rail and for tests. */
export interface RecordLayerStatus {
  /**
   * `loading` while the TileJSON or tiles for the view are in flight; `ready` when the view is
   * drawn; `aggregated` when the view is below the layer's `aggBelowZoom`, where hexagon counts
   * (008) take over and no records are drawn; `error` when the layer cannot load.
   */
  state: 'loading' | 'ready' | 'aggregated' | 'error';
  /** Records drawn now. */
  features: number;
  /** Tiles drawn now. */
  tiles: number;
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

/** What a layer needs from the map to draw. */
export interface RecordLayerContext {
  api: ForesignalClient;
  scene: Scene;
  model: StyleModel;
  images: SymbolImages;
}

/** The pick id each drawn record carries, for selection (014). */
export interface RecordPickId {
  layer: string;
  source?: string;
  externalId?: string;
  kind?: string;
}

/** One drawn tile: its billboards in the layer's collection and its ground primitives. */
interface DrawnTile {
  billboards: Billboard[];
  primitives: (GroundPrimitive | GroundPolylinePrimitive)[];
  features: number;
}

/**
 * One backend record layer on the map, drawn from its vector tiles (`getTileJson`, `getTile`).
 * Batched: every point of the layer is a billboard in one `BillboardCollection`, sharing one
 * texture per distinct symbol; each tile's lines and polygon outlines are one
 * `GroundPolylinePrimitive` and its fills one `GroundPrimitive`, so there is never a Cesium
 * `Entity` or DOM node per record. Points are clamped to the terrain and depth-tested against the
 * globe, so they sit on the raised 3D relief and hide behind the Earth; the same records draw in
 * 2D. Tiles for a new view load before the old view's tiles are removed, so panning does not blink.
 */
export class RecordLayer {
  private readonly billboards: BillboardCollection;
  private readonly drawn = new Map<string, DrawnTile>();
  private readonly inFlight = new Map<string, AbortController>();
  private queue: TileId[] = [];
  private wanted = new Set<string>();
  private tiles?: LayerTiles;
  private tileJson?: Promise<LayerTiles | undefined>;
  private view?: RecordView;
  private destroyed = false;
  private failure?: string;

  /**
   * @param id The layer id (`listTileLayers`: a source id or a kind).
   * @param context The API client, scene, style model and symbol images.
   * @param onStatus Told each time what the layer shows changes.
   */
  constructor(
    readonly id: string,
    private readonly context: RecordLayerContext,
    private readonly onStatus: (status: RecordLayerStatus) => void = () => {},
  ) {
    this.billboards = context.scene.primitives.add(
      new BillboardCollection({ scene: context.scene }),
    ) as BillboardCollection;
  }

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

  /** Removes everything the layer drew and cancels its requests. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const controller of this.inFlight.values()) controller.abort();
    this.inFlight.clear();
    for (const key of [...this.drawn.keys()]) this.removeTile(key);
    if (!this.context.scene.isDestroyed()) this.context.scene.primitives.remove(this.billboards);
  }

  /** Records drawn now (for tests and the status). */
  get featureCount(): number {
    let total = 0;
    for (const tile of this.drawn.values()) total += tile.features;
    return total;
  }

  /** Fetches the layer's TileJSON and reads its template, zoom range, bounds and aggregation. */
  private async loadTileJson(): Promise<LayerTiles | undefined> {
    const result = await loadLayerTiles(this.context.api, this.id);
    if (this.destroyed) return undefined;
    if (!result.ok) {
      this.fail(result.message);
      return undefined;
    }
    this.tiles = result.tiles;
    return this.tiles;
  }

  /** Works out the tiles a view needs, starts loading the missing ones and tidies up. */
  private plan(view: RecordView): void {
    const tiles = this.tiles;
    if (!tiles || this.destroyed) return;
    if (tiles.aggBelowZoom !== undefined && Math.floor(view.zoom) < tiles.aggBelowZoom) {
      this.wanted = new Set();
      this.queue = [];
      for (const controller of this.inFlight.values()) controller.abort();
      this.inFlight.clear();
      for (const key of [...this.drawn.keys()]) this.removeTile(key);
      this.report();
      return;
    }
    const needed = planTiles({
      rect: view.rect,
      zoom: view.zoom,
      // Never below aggBelowZoom: the backend answers there with aggregate cells, not records.
      minzoom: Math.max(tiles.minzoom, tiles.aggBelowZoom ?? 0),
      maxzoom: tiles.maxzoom,
      bounds: tiles.bounds,
      maxTiles: MAX_TILES_PER_LAYER,
    });
    this.wanted = new Set(needed.map(tileKey));
    for (const [key, controller] of this.inFlight) {
      if (!this.wanted.has(key)) {
        controller.abort();
        this.inFlight.delete(key);
      }
    }
    this.queue = needed.filter((tile) => {
      const key = tileKey(tile);
      return !this.drawn.has(key) && !this.inFlight.has(key);
    });
    this.pump();
    this.settle();
  }

  /** Starts queued tile requests up to the in-flight limit. */
  private pump(): void {
    while (this.inFlight.size < MAX_IN_FLIGHT && this.queue.length > 0) {
      const tile = this.queue.shift()!;
      void this.loadTile(tile);
    }
    this.report();
  }

  /** Fetches, decodes and draws one tile. */
  private async loadTile(tile: TileId): Promise<void> {
    const key = tileKey(tile);
    const tiles = this.tiles!;
    const controller = new AbortController();
    this.inFlight.set(key, controller);
    try {
      const result = await fetchTile(this.context.api, tiles.template, tile, controller.signal);
      if (this.destroyed || controller.signal.aborted) return;
      if (result.status === 'missing') {
        this.fail(result.message);
      } else if (result.status === 'failed') {
        console.warn(`ForeSignal: tile ${this.id} ${key} failed (${result.message}).`);
      } else if (this.wanted.has(key)) {
        this.drawTile(key, result.features, this.view?.zoom ?? tile.z);
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

  /** Once nothing the view wants is pending, removes the tiles of earlier views. */
  private settle(): void {
    if (this.queue.length > 0 || this.inFlight.size > 0) return;
    for (const key of [...this.drawn.keys()]) if (!this.wanted.has(key)) this.removeTile(key);
    this.report();
  }

  /** Draws a decoded tile's records, batched per tile. */
  private drawTile(key: string, features: RecordFeature[], zoom: number): void {
    if (this.drawn.has(key)) this.removeTile(key);
    const { model, images, scene } = this.context;
    const billboards: Billboard[] = [];
    const lines: GeometryInstance[] = [];
    const fills: GeometryInstance[] = [];
    let count = 0;
    for (const feature of features) {
      const { properties, geometry } = feature;
      const symbol = resolveSymbol(model, feature.layer, properties, geometry.type, zoom);
      if (!symbol) continue;
      const id: RecordPickId = {
        layer: this.id,
        source: stringProperty(properties.source),
        externalId: stringProperty(properties.externalId),
        kind: stringProperty(properties.kind),
      };
      count++;
      if (symbol.type === 'point' && geometry.type === 'point') {
        const image = images.imageFor(symbol.point);
        if (!image) continue;
        for (const [lon, lat] of geometry.points) {
          const billboard = this.billboards.add({
            position: Cartesian3.fromDegrees(lon, lat),
            heightReference: HeightReference.CLAMP_TO_GROUND,
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
        }
      } else if (symbol.type === 'line' && geometry.type === 'line') {
        for (const line of geometry.lines) addLine(lines, line, symbol.line, id);
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
      }
    }
    const primitives: (GroundPrimitive | GroundPolylinePrimitive)[] = [];
    if (fills.length) {
      primitives.push(
        scene.groundPrimitives.add(
          new GroundPrimitive({
            geometryInstances: fills,
            appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
            asynchronous: true,
          }),
        ) as GroundPrimitive,
      );
    }
    if (lines.length) {
      primitives.push(
        scene.groundPrimitives.add(
          new GroundPolylinePrimitive({
            geometryInstances: lines,
            appearance: new PolylineColorAppearance(),
            asynchronous: true,
          }),
        ) as GroundPolylinePrimitive,
      );
    }
    this.drawn.set(key, { billboards, primitives, features: count });
  }

  /** Removes one drawn tile. */
  private removeTile(key: string): void {
    const tile = this.drawn.get(key);
    if (!tile) return;
    for (const billboard of tile.billboards) this.billboards.remove(billboard);
    if (!this.context.scene.isDestroyed()) {
      for (const primitive of tile.primitives)
        this.context.scene.groundPrimitives.remove(primitive);
    }
    this.drawn.delete(key);
  }

  /** Marks the layer failed and clears it. */
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
    else if (!this.tiles || this.inFlight.size > 0 || this.queue.length > 0) state = 'loading';
    else if (
      this.tiles.aggBelowZoom !== undefined &&
      this.view &&
      Math.floor(this.view.zoom) < this.tiles.aggBelowZoom
    )
      state = 'aggregated';
    else state = 'ready';
    this.onStatus(
      this.failure ? { state, features, tiles, message: this.failure } : { state, features, tiles },
    );
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

/** Degrees to Cartesian positions on the ellipsoid. */
function positions(coordinates: [number, number][]): Cartesian3[] {
  return Cartesian3.fromDegreesArray(coordinates.flat());
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
