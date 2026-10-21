import { SceneMode, type Viewer } from 'cesium';
import type { ForesignalClient } from '../../api/client';
import type { OverlayStyle } from '../style/loadOverlayStyle';
import { ClientCellLayer } from './clientCellLayer';
import { shouldCluster } from './clientClusters';
import type { RecordFeature } from './decodeTile';
import { FrameLayer } from './frameLayer';
import { LayerSources } from './layerSources';
import type { Box, ChangedArea } from './liveChanges';
import { RecordBatch } from './recordBatch';
import {
  readRecordView,
  RecordLayer,
  type RecordLayerStatus,
  type RecordView,
} from './recordLayers';
import { compareHits, type PickQuery, type RecordHit } from './recordPicking';
import { SymbolImages } from './symbolImages';

/** How long the camera must rest before the layers fetch tiles for the new view, in ms. */
const VIEW_SETTLE_MS = 150;

/** How much the camera must move (as a fraction) to count as a change. */
const CAMERA_CHANGE_FRACTION = 0.05;

/** How long layer statuses are gathered before the owner is told, in ms. */
export const STATUS_FLUSH_MS = 50;

/**
 * The live stream's changes are gathered for this long, in ms, then each layer fetches the tiles
 * they touched once: a busy kind costs a tile request per second, not one per change.
 */
export const LIVE_REFRESH_MS = 1_000;

/** Past this many changed boxes in one layer per refresh, every drawn tile of it is fetched again. */
const MAX_LIVE_BOXES = 200;

/** One per API client, so every map on the page (the split view's two) shares TileJSON and tiles. */
const SOURCES = new WeakMap<ForesignalClient, LayerSources>();

/** The shared sources for an API client. */
export function sourcesFor(api: ForesignalClient): LayerSources {
  let sources = SOURCES.get(api);
  if (!sources) {
    sources = new LayerSources(api);
    SOURCES.set(api, sources);
  }
  return sources;
}

/** What the last change of layers cost, for the stress harness. */
export interface LayerChange {
  added: number;
  removed: number;
  /** Milliseconds of main-thread work the change took (not the tiles it then loads). */
  ms: number;
}

/** What the set draws now, across its layers. */
export interface DrawnTotals {
  layers: number;
  /** Layers still loading their TileJSON or the view's tiles. */
  loading: number;
  features: number;
  /** Cells drawn: the backend's and the client's (037). */
  cells: number;
  /** Records the drawn cells count. */
  aggregated: number;
  tiles: number;
  /** Instances in the merged ground and cell primitives. */
  instances: number;
  /** Builds of the merged primitives so far. */
  builds: number;
  /** True while a merged primitive waits for, or is in, a build. */
  building: boolean;
  /**
   * Points on the map now, including those kept until the cells replacing them show; with
   * {@link cellsShown}, what the map shows at this frame (037's switch must never show neither).
   */
  pointsShown: number;
  /** Cell instances in the cell primitive on the map now (not one still building). */
  cellsShown: number;
}

/**
 * The enabled record layers on one viewer. Every layer draws into one shared {@link RecordBatch},
 * so the scene's draw calls do not grow with the number of layers, and reads its TileJSON and tiles
 * through the shared {@link LayerSources}, so a layer turned back on draws from memory. It
 * restyles every layer when the overlay style changes, tells each one the current view whenever the
 * camera settles (and after a 2D/3D switch), and gathers the layers' status changes so the owner is
 * told once per {@link STATUS_FLUSH_MS}, not once per tile per layer. {@link pick} answers which
 * records are under the pointer. When the layers' tiles hold more points in view than
 * {@link CLUSTER_POINT_BUDGET}, every layer the backend does not aggregate draws its points as the
 * client's cells below {@link CLIENT_CLUSTER_BELOW_ZOOM} (037), merged across the layers in one
 * {@link ClientCellLayer}, so the whole catalog at world zoom draws hundreds of cells, not tens of
 * thousands of points.
 */
export class RecordLayerSet {
  private readonly layers = new Map<string, RecordLayer>();
  private readonly batch: RecordBatch;
  private readonly sources: LayerSources;
  private images?: SymbolImages;
  private overlay?: OverlayStyle;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly removers: (() => void)[] = [];
  private view?: RecordView;
  private hiddenSources: ReadonlySet<string> = new Set();
  private readonly pendingStatus = new Map<string, RecordLayerStatus>();
  private statusTimer?: ReturnType<typeof setTimeout>;
  /** What the last {@link setLayers} cost. */
  lastChange?: LayerChange;
  /** Changed boxes per layer waiting for the next live refresh; `all` for every tile. */
  private readonly liveBoxes = new Map<string, Box[] | 'all'>();
  private liveTimer?: ReturnType<typeof setTimeout>;
  /** The layers asked for, drawn from tiles unless a history step is shown. */
  private ids: readonly string[] = [];
  /** The instant the tiles are drawn as of; undefined for live data (013). */
  private asOf?: string;
  /** The history step shown instead of the tiles, if any (013). */
  private frame?: readonly RecordFeature[];
  private frameLayer?: FrameLayer;
  /** The client's cells, shared by the layers that cluster (037). */
  private readonly clusters: ClientCellLayer;
  /** Whether the layers cluster their points now. */
  private clustering = false;

  /**
   * @param viewer The Cesium viewer to draw into.
   * @param api The API client for TileJSON and tiles.
   * @param onStatus Told when a layer's status changes; changes arrive together, in one task.
   */
  constructor(
    private readonly viewer: Viewer,
    api: ForesignalClient,
    private readonly onStatus: (id: string, status: RecordLayerStatus) => void,
  ) {
    this.sources = sourcesFor(api);
    this.batch = new RecordBatch(viewer.scene);
    this.clusters = new ClientCellLayer(this.batch);
    const { camera, scene } = viewer;
    camera.percentageChanged = CAMERA_CHANGE_FRACTION;
    const schedule = () => this.schedule();
    // Points are clamped to the terrain only on the 3D globe, where its relief shows.
    const clamp = () => this.batch.setClamped(scene.mode === SceneMode.SCENE3D);
    clamp();
    this.removers.push(
      camera.changed.addEventListener(schedule),
      camera.moveEnd.addEventListener(schedule),
      scene.morphComplete.addEventListener(schedule),
      scene.morphComplete.addEventListener(clamp),
    );
  }

  /** Sets the overlay style; a new style redraws every layer with it. */
  setStyle(overlay: OverlayStyle | undefined): void {
    if (overlay === this.overlay) return;
    this.overlay = overlay;
    this.clusters.setModel(overlay?.model);
    this.images = overlay
      ? new SymbolImages(overlay.sprite, window.devicePixelRatio || 1)
      : undefined;
    const ids = [...this.layers.keys()];
    for (const id of ids) this.remove(id);
    for (const id of ids) this.add(id);
    this.frameLayer?.clear();
    this.frameLayer = undefined;
    this.drawFrame();
  }

  /** Sets which layers are drawn: adds the new ones and removes the rest. */
  setLayers(ids: readonly string[]): void {
    const changed = ids !== this.ids;
    this.ids = ids;
    if (this.frame) {
      if (changed) this.drawFrame();
      return;
    }
    const start = performance.now();
    const wanted = new Set(ids);
    let removed = 0;
    let added = 0;
    for (const id of [...this.layers.keys()]) {
      if (!wanted.has(id)) {
        this.remove(id);
        removed++;
      }
    }
    for (const id of ids) {
      if (!this.layers.has(id)) {
        this.add(id);
        added++;
      }
    }
    if (added + removed > 0) this.lastChange = { added, removed, ms: performance.now() - start };
  }

  /**
   * Takes record changes from the live stream: the layers drawing their kind fetch the tiles they
   * touched again, gathered over {@link LIVE_REFRESH_MS}. Changes to kinds not drawn are ignored.
   */
  applyAreas(areas: readonly ChangedArea[]): void {
    // Pinned in the past, the map does not follow the present; it is fetched afresh on return.
    if (this.asOf !== undefined || this.frame) return;
    for (const area of areas) {
      for (const id of [area.kind, area.source]) {
        if (!this.layers.has(id)) continue;
        const boxes = this.liveBoxes.get(id) ?? [];
        if (boxes === 'all') continue;
        boxes.push(...area.boxes);
        this.liveBoxes.set(id, boxes.length > MAX_LIVE_BOXES ? 'all' : boxes);
      }
    }
    this.scheduleLive();
  }

  /** Fetches every drawn tile of every layer again: the stream lost updates (a resync). */
  reload(): void {
    if (this.asOf !== undefined || this.frame) return;
    for (const id of this.layers.keys()) this.liveBoxes.set(id, 'all');
    this.scheduleLive();
  }

  /**
   * Pins the tile layers at an instant (013), as an RFC 3339 string to the second, or returns them
   * to live data with undefined. Each layer is drawn again from its TileJSON as of that instant,
   * whose template carries the instant the tiles are asked for with. While pinned, the live
   * stream's changes are not applied; back at live, every tile is fetched afresh, so what changed
   * meanwhile is drawn.
   */
  setAsOf(asOf: string | undefined): void {
    if (asOf === this.asOf) return;
    const backToLive = asOf === undefined;
    this.asOf = asOf;
    this.liveBoxes.clear();
    if (backToLive) this.sources.forgetTiles();
    if (this.frame) return;
    const ids = [...this.layers.keys()];
    for (const id of ids) this.remove(id);
    for (const id of ids) this.add(id);
  }

  /** The instant the tile layers are pinned at, or undefined while live. */
  get pinnedAt(): string | undefined {
    return this.asOf;
  }

  /**
   * Shows one step of a history playback (013) in place of the tile layers: the records of the
   * enabled layers as they were then, drawn with the same symbols. Undefined ends the playback and
   * draws the tile layers again (as of {@link setAsOf}'s instant).
   */
  setFrame(features: readonly RecordFeature[] | undefined): void {
    if (features === this.frame) return;
    const wasFrame = this.frame !== undefined;
    this.frame = features;
    if (features) {
      if (!wasFrame) for (const id of [...this.layers.keys()]) this.remove(id);
      this.drawFrame();
      return;
    }
    this.frameLayer?.clear();
    const ids = this.ids;
    this.ids = [];
    this.setLayers(ids);
  }

  /** Records the shown history step draws (0 when none is shown). */
  get frameRecords(): number {
    return this.frameLayer?.count ?? 0;
  }

  /** Draws the shown history step with the current layers, filters and style. */
  private drawFrame(): void {
    if (!this.frame || !this.overlay || !this.images || this.viewer.isDestroyed()) return;
    this.frameLayer ??= new FrameLayer({
      batch: this.batch,
      model: this.overlay.model,
      images: this.images,
    });
    const counts = this.frameLayer.draw(
      this.frame,
      new Set(this.ids),
      this.hiddenSources,
      this.currentView().zoom,
    );
    for (const id of this.ids) {
      this.queueStatus(id, { state: 'ready', features: counts.get(id) ?? 0, tiles: 0 });
    }
  }

  /** Tiles fetched again for live changes so far, across the layers drawn now. */
  get refreshed(): number {
    let total = 0;
    for (const layer of this.layers.values()) total += layer.refreshed;
    return total;
  }

  private scheduleLive(): void {
    if (this.liveTimer !== undefined || this.liveBoxes.size === 0) return;
    this.liveTimer = setTimeout(() => {
      this.liveTimer = undefined;
      const pending = [...this.liveBoxes];
      this.liveBoxes.clear();
      for (const [id, boxes] of pending) {
        this.layers.get(id)?.refresh(boxes === 'all' ? undefined : boxes);
      }
    }, LIVE_REFRESH_MS);
  }

  /** Hides the records of these sources in every layer (the FILTERS tab). */
  setHiddenSources(hidden: ReadonlySet<string>): void {
    this.hiddenSources = hidden;
    for (const layer of this.layers.values()) layer.setHiddenSources(hidden);
    this.drawFrame();
  }

  /** The records under the pointer across every layer, topmost first. */
  pick(query: PickQuery): RecordHit[] {
    const hits: RecordHit[] = [];
    for (const layer of this.layers.values()) hits.push(...layer.pick(query));
    hits.push(...this.clusters.pick(query));
    if (this.frame && this.frameLayer) hits.push(...this.frameLayer.pick(query));
    return hits.sort(compareHits);
  }

  /** Tile requests waiting for a slot and in flight, across every layer. */
  get requests(): { waiting: number; active: number } {
    return this.sources.queued;
  }

  /** Records drawn now, per layer. */
  counts(): Record<string, number> {
    return Object.fromEntries([...this.layers].map(([id, layer]) => [id, layer.featureCount]));
  }

  /** What is drawn now, across every layer. */
  totals(): DrawnTotals {
    const totals: DrawnTotals = {
      layers: this.layers.size,
      loading: 0,
      features: 0,
      cells: this.clusters.cellCount,
      aggregated: this.clusters.recordCount,
      tiles: 0,
      instances: 0,
      builds: 0,
      building: false,
      pointsShown: this.batch.points.length,
      cellsShown: this.batch.cellFills.drawnCount,
    };
    for (const layer of this.layers.values()) {
      totals.features += layer.featureCount;
      totals.cells += layer.cellCount;
      totals.aggregated += layer.aggregatedCount;
      totals.tiles += layer.tileCount;
      if (layer.loading) totals.loading++;
    }
    totals.features += this.frameRecords;
    for (const merged of this.batch.merged) {
      totals.instances += merged.instanceCount;
      totals.builds += merged.builds;
      totals.building ||= merged.pending;
    }
    return totals;
  }

  /** Removes every layer and stops following the camera. */
  destroy(): void {
    clearTimeout(this.timer);
    clearTimeout(this.statusTimer);
    clearTimeout(this.liveTimer);
    for (const remove of this.removers) remove();
    for (const id of [...this.layers.keys()]) this.remove(id);
    this.frameLayer?.clear();
    this.clusters.destroy();
    if (!this.viewer.isDestroyed()) this.batch.destroy();
  }

  private add(id: string): void {
    if (!this.overlay || !this.images || this.viewer.isDestroyed()) return;
    const layer = new RecordLayer(
      id,
      {
        sources: this.sources,
        batch: this.batch,
        model: this.overlay.model,
        images: this.images,
        asOf: this.asOf,
        clusters: this.clusters,
      },
      (status) => this.queueStatus(id, status),
    );
    this.layers.set(id, layer);
    layer.setHiddenSources(this.hiddenSources);
    layer.setClusterAllowed(this.clustering);
    layer.update(this.currentView());
  }

  private remove(id: string): void {
    this.layers.get(id)?.destroy();
    this.layers.delete(id);
    this.pendingStatus.delete(id);
    this.scheduleStatus();
  }

  /** Gathers a layer's status; the owner is told of every change together, shortly. */
  private queueStatus(id: string, status: RecordLayerStatus): void {
    this.pendingStatus.set(id, status);
    this.scheduleStatus();
  }

  /**
   * Tells the owner of the gathered statuses shortly, and then decides again whether the layers
   * cluster: the points in view have changed with them.
   */
  private scheduleStatus(): void {
    this.statusTimer ??= setTimeout(() => {
      this.statusTimer = undefined;
      const changes = [...this.pendingStatus];
      this.pendingStatus.clear();
      for (const [layer, latest] of changes) this.onStatus(layer, latest);
      this.decideClustering();
    }, STATUS_FLUSH_MS);
  }

  /**
   * Clusters the layers' points while the view's tiles hold more than the budget across the
   * layers, and stops once they hold fewer than the release ({@link shouldCluster}).
   */
  private decideClustering(): void {
    if (this.viewer.isDestroyed()) return;
    let points = 0;
    for (const layer of this.layers.values()) points += layer.pointsInView;
    const next = shouldCluster(points, this.clustering);
    if (next === this.clustering) return;
    this.clustering = next;
    for (const layer of this.layers.values()) layer.setClusterAllowed(next);
  }

  /** Reads the view once the camera rests, and hands it to every layer. */
  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // Mid-morph the camera is between projections; morphComplete schedules a fresh read.
      if (this.viewer.isDestroyed() || this.viewer.scene.mode === SceneMode.MORPHING) return;
      this.view = readRecordView(this.viewer);
      for (const layer of this.layers.values()) layer.update(this.view);
    }, VIEW_SETTLE_MS);
  }

  private currentView(): RecordView {
    this.view ??= readRecordView(this.viewer);
    return this.view;
  }
}
