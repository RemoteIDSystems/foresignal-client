import { SceneMode, type Viewer } from 'cesium';
import type { ForesignalClient } from '../../api/client';
import type { OverlayStyle } from '../style/loadOverlayStyle';
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
  cells: number;
  tiles: number;
  /** Instances in the merged ground and cell primitives. */
  instances: number;
  /** Builds of the merged primitives so far. */
  builds: number;
  /** True while a merged primitive waits for, or is in, a build. */
  building: boolean;
}

/**
 * The enabled record layers on one viewer. Every layer draws into one shared {@link RecordBatch},
 * so the scene's draw calls do not grow with the number of layers, and reads its TileJSON and tiles
 * through the shared {@link LayerSources}, so a layer turned back on draws from memory. It
 * restyles every layer when the overlay style changes, tells each one the current view whenever the
 * camera settles (and after a 2D/3D switch), and gathers the layers' status changes so the owner is
 * told once per {@link STATUS_FLUSH_MS}, not once per tile per layer. {@link pick} answers which
 * records are under the pointer.
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
    this.images = overlay
      ? new SymbolImages(overlay.sprite, window.devicePixelRatio || 1)
      : undefined;
    const ids = [...this.layers.keys()];
    for (const id of ids) this.remove(id);
    for (const id of ids) this.add(id);
  }

  /** Sets which layers are drawn: adds the new ones and removes the rest. */
  setLayers(ids: readonly string[]): void {
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
    for (const id of this.layers.keys()) this.liveBoxes.set(id, 'all');
    this.scheduleLive();
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
  }

  /** The records under the pointer across every layer, topmost first. */
  pick(query: PickQuery): RecordHit[] {
    const hits: RecordHit[] = [];
    for (const layer of this.layers.values()) hits.push(...layer.pick(query));
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
      cells: 0,
      tiles: 0,
      instances: 0,
      builds: 0,
      building: false,
    };
    for (const layer of this.layers.values()) {
      totals.features += layer.featureCount;
      totals.cells += layer.cellCount;
      totals.tiles += layer.tileCount;
      if (layer.loading) totals.loading++;
    }
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
    if (!this.viewer.isDestroyed()) this.batch.destroy();
  }

  private add(id: string): void {
    if (!this.overlay || !this.images || this.viewer.isDestroyed()) return;
    const layer = new RecordLayer(
      id,
      { sources: this.sources, batch: this.batch, model: this.overlay.model, images: this.images },
      (status) => this.queueStatus(id, status),
    );
    this.layers.set(id, layer);
    layer.setHiddenSources(this.hiddenSources);
    layer.update(this.currentView());
  }

  private remove(id: string): void {
    this.layers.get(id)?.destroy();
    this.layers.delete(id);
    this.pendingStatus.delete(id);
  }

  /** Gathers a layer's status; the owner is told of every change together, shortly. */
  private queueStatus(id: string, status: RecordLayerStatus): void {
    this.pendingStatus.set(id, status);
    this.statusTimer ??= setTimeout(() => {
      this.statusTimer = undefined;
      const changes = [...this.pendingStatus];
      this.pendingStatus.clear();
      for (const [layer, latest] of changes) this.onStatus(layer, latest);
    }, STATUS_FLUSH_MS);
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
