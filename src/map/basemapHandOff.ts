import { SceneMode, type ImageryLayer, type Viewer } from 'cesium';
import { detailForZoom, type DetailSource } from './basemapStyle';
import { readRecordView } from './records/recordLayers';

/** The parts of a Cesium viewer {@link BasemapHandOff} uses. */
export interface HandOffViewer {
  camera: Pick<Viewer['camera'], 'changed' | 'moveEnd'>;
  scene: Pick<Viewer['scene'], 'mode' | 'morphComplete'> & {
    globe: Pick<Viewer['scene']['globe'], 'tileLoadProgressEvent'>;
  };
  imageryLayers: Pick<Viewer['imageryLayers'], 'add' | 'remove' | 'indexOf' | 'contains'>;
  isDestroyed(): boolean;
}

/** What {@link BasemapHandOff} is built with. */
export interface HandOffOptions {
  /** The detailed source to draw past the hand-off zoom. */
  source: DetailSource;
  /** The overview's top layer (the night lights): the detailed basemap goes right above it. */
  above: ImageryLayer;
  /** Makes the layer for a detailed source. */
  createLayer: (source: DetailSource) => ImageryLayer;
  /**
   * Told the detailed source drawn now and its layer, or undefined while only the overview is.
   */
  onShown?: (source: DetailSource | undefined, layer: ImageryLayer | undefined) => void;
  /** The view's map zoom; {@link readRecordView}'s by default. */
  zoomOf?: () => number;
  /**
   * How long a replaced layer is kept at most while its replacement loads, in milliseconds: past
   * it the old layer goes even if the globe is still loading (a source that never answers).
   */
  swapTimeoutMs?: number;
}

/** The longest a replaced detailed layer stays under its replacement, by default. */
export const SWAP_TIMEOUT_MS = 10_000;

/**
 * Hands the basemap off from the NASA Marble overview to a detailed source as the user zooms in,
 * and back as they zoom out (005's overview zoom, {@link detailForZoom}). The overview layers stay
 * on the globe at every zoom, so they are loaded under the detailed layer:
 *
 * - zooming in, the detailed layer is shown over them and Cesium draws the overview through it
 *   wherever its own tiles have not come in yet;
 * - zooming out, the detailed layer is hidden and the overview under it is already drawn;
 * - switching source while zoomed in, the new layer is added over the old one, and the old one
 *   goes only once the globe has loaded every tile ({@link Globe.tileLoadProgressEvent} reaching
 *   0), or after {@link HandOffOptions.swapTimeoutMs}.
 *
 * The zoom is read when the camera has moved (its `changed` and `moveEnd` events, and after a
 * 2D/3D switch), and the layers change only at the crossing, not every frame.
 */
export class BasemapHandOff {
  private readonly viewer: HandOffViewer;
  private readonly options: Required<Omit<HandOffOptions, 'onShown'>> &
    Pick<HandOffOptions, 'onShown'>;
  private source: DetailSource;
  private detail = false;
  /** The layer drawing {@link source}, made the first time it is shown. */
  private layer: ImageryLayer | undefined;
  /** Layers replaced by {@link layer}, kept until it has loaded. */
  private outgoing: ImageryLayer[] = [];
  private stopSwap: (() => void) | undefined;
  private swapTimer: ReturnType<typeof setTimeout> | undefined;
  private shown: DetailSource | undefined;
  private readonly removers: (() => void)[];
  private destroyed = false;

  constructor(viewer: HandOffViewer, options: HandOffOptions) {
    this.viewer = viewer;
    this.options = {
      zoomOf: () => readRecordView(viewer as Viewer).zoom,
      swapTimeoutMs: SWAP_TIMEOUT_MS,
      ...options,
    };
    this.source = options.source;
    const update = () => this.update();
    this.removers = [
      viewer.camera.changed.addEventListener(update),
      viewer.camera.moveEnd.addEventListener(update),
      viewer.scene.morphComplete.addEventListener(update),
    ];
    this.update();
  }

  /** The detailed source drawn now, or undefined while only the overview is. */
  get shownSource(): DetailSource | undefined {
    return this.shown;
  }

  /** Draws `source` past the hand-off zoom from now on; swapped in without a blink if shown now. */
  setSource(source: DetailSource): void {
    if (this.destroyed || source === this.source) return;
    this.source = source;
    const previous = this.layer;
    this.layer = undefined;
    if (!previous) return;
    if (!this.detail || !previous.show) {
      this.drop(previous);
      this.apply();
      return;
    }
    this.outgoing.push(previous);
    this.apply();
    this.awaitLoad();
  }

  /** Reads the zoom and hands off if it crossed. */
  update(): void {
    if (this.destroyed || this.viewer.isDestroyed()) return;
    if (this.viewer.scene.mode === SceneMode.MORPHING) return;
    const detail = detailForZoom(this.options.zoomOf(), this.detail);
    if (detail === this.detail) return;
    this.detail = detail;
    // Zoomed back out: the overview is under every layer, so the replaced ones can go now.
    if (!detail) this.retireOutgoing();
    this.apply();
  }

  /** Removes every layer it added and stops following the camera. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removers.forEach((remove) => remove());
    this.retireOutgoing();
    if (this.layer) this.drop(this.layer);
    this.layer = undefined;
  }

  /** Shows or hides the current layer, making it the first time it is shown. */
  private apply(): void {
    if (this.detail && !this.layer) {
      this.layer = this.options.createLayer(this.source);
      const { imageryLayers } = this.viewer;
      // Over the overview and any layer it replaces, under everything else (products, records).
      const below = [this.options.above, ...this.outgoing].filter((layer) =>
        imageryLayers.contains(layer),
      );
      const index = Math.max(-1, ...below.map((layer) => imageryLayers.indexOf(layer))) + 1;
      imageryLayers.add(this.layer, index);
    }
    if (this.layer) this.layer.show = this.detail;
    this.report();
  }

  /** Waits for the globe to load every tile, then retires the replaced layers. */
  private awaitLoad(): void {
    this.stopSwap?.();
    clearTimeout(this.swapTimer);
    const stop = this.viewer.scene.globe.tileLoadProgressEvent.addEventListener(
      (queued: number) => {
        if (queued === 0) this.retireOutgoing();
      },
    );
    this.stopSwap = stop;
    this.swapTimer = setTimeout(() => this.retireOutgoing(), this.options.swapTimeoutMs);
  }

  /** Removes the replaced layers and stops waiting for their replacement. */
  private retireOutgoing(): void {
    this.stopSwap?.();
    this.stopSwap = undefined;
    clearTimeout(this.swapTimer);
    this.swapTimer = undefined;
    const outgoing = this.outgoing;
    this.outgoing = [];
    outgoing.forEach((layer) => this.drop(layer));
  }

  /** Removes and destroys one layer, unless the viewer has gone (which destroyed it). */
  private drop(layer: ImageryLayer): void {
    if (!this.viewer.isDestroyed() && this.viewer.imageryLayers.contains(layer)) {
      this.viewer.imageryLayers.remove(layer, true);
    }
  }

  /** Tells the listener the source drawn now, when it changed. */
  private report(): void {
    const shown = this.detail ? this.source : undefined;
    if (shown === this.shown) return;
    this.shown = shown;
    this.options.onShown?.(shown, shown ? this.layer : undefined);
  }
}
