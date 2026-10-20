import { SceneMode, type Viewer } from 'cesium';
import type { ForesignalClient } from '../../api/client';
import type { OverlayStyle } from '../style/loadOverlayStyle';
import {
  readRecordView,
  RecordLayer,
  type RecordLayerStatus,
  type RecordView,
} from './recordLayers';
import { SymbolImages } from './symbolImages';

/** How long the camera must rest before the layers fetch tiles for the new view, in ms. */
const VIEW_SETTLE_MS = 150;

/** How much the camera must move (as a fraction) to count as a change. */
const CAMERA_CHANGE_FRACTION = 0.05;

/**
 * The enabled record layers on one viewer. It keeps one {@link RecordLayer} per enabled layer id,
 * restyles them all when the overlay style changes, and tells each one the current view whenever
 * the camera settles (and after a 2D/3D switch).
 */
export class RecordLayerSet {
  private readonly layers = new Map<string, RecordLayer>();
  private images?: SymbolImages;
  private overlay?: OverlayStyle;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly removers: (() => void)[] = [];
  private view?: RecordView;
  private hiddenSources: ReadonlySet<string> = new Set();

  /**
   * @param viewer The Cesium viewer to draw into.
   * @param api The API client for TileJSON and tiles.
   * @param onStatus Told when a layer's status changes.
   */
  constructor(
    private readonly viewer: Viewer,
    private readonly api: ForesignalClient,
    private readonly onStatus: (id: string, status: RecordLayerStatus) => void,
  ) {
    const { camera, scene } = viewer;
    camera.percentageChanged = CAMERA_CHANGE_FRACTION;
    const schedule = () => this.schedule();
    this.removers.push(
      camera.changed.addEventListener(schedule),
      camera.moveEnd.addEventListener(schedule),
      scene.morphComplete.addEventListener(schedule),
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
    const wanted = new Set(ids);
    for (const id of [...this.layers.keys()]) if (!wanted.has(id)) this.remove(id);
    for (const id of ids) if (!this.layers.has(id)) this.add(id);
  }

  /** Hides the records of these sources in every layer (the FILTERS tab). */
  setHiddenSources(hidden: ReadonlySet<string>): void {
    this.hiddenSources = hidden;
    for (const layer of this.layers.values()) layer.setHiddenSources(hidden);
  }

  /** Records drawn now, per layer. */
  counts(): Record<string, number> {
    return Object.fromEntries([...this.layers].map(([id, layer]) => [id, layer.featureCount]));
  }

  /** Removes every layer and stops following the camera. */
  destroy(): void {
    clearTimeout(this.timer);
    for (const remove of this.removers) remove();
    for (const id of [...this.layers.keys()]) this.remove(id);
  }

  private add(id: string): void {
    if (!this.overlay || !this.images || this.viewer.isDestroyed()) return;
    const layer = new RecordLayer(
      id,
      { api: this.api, scene: this.viewer.scene, model: this.overlay.model, images: this.images },
      (status) => this.onStatus(id, status),
    );
    this.layers.set(id, layer);
    layer.setHiddenSources(this.hiddenSources);
    layer.update(this.currentView());
  }

  private remove(id: string): void {
    this.layers.get(id)?.destroy();
    this.layers.delete(id);
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
