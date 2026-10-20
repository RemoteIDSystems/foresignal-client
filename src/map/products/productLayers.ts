import {
  BillboardCollection,
  Cartesian3,
  Color,
  HeightReference,
  ImageryLayer,
  Material,
  Math as CesiumMath,
  PolylineCollection,
  Rectangle,
  SceneMode,
  VerticalOrigin,
  type Billboard,
  type Polyline,
  type Viewer,
} from 'cesium';
import type { ForesignalClient } from '../../api/client';
import { FsError } from '../../api/errors';
import type { CommittedViewport } from '../../state/viewport';
import { decodeTile } from '../records/decodeTile';
import { readRecordView, type RecordView } from '../records/recordLayers';
import { planTiles, tileKey, type TileId } from '../records/tileMath';
import { BARB_SIZE, drawBarb } from './barbGlyph';
import { reprojectToGeographic } from './loopImage';
import { ParticleSystem, TRAIL_LENGTH } from './particles';
import {
  fetchFieldPng,
  fetchLoopImage,
  fetchWindTile,
  liveFrames,
  loadFieldManifest,
  loadLatestFrame,
  loadLoop,
  parseProductTileTemplate,
  pollInterval,
  type LoopFrame,
  type Product,
  type RasterFrame,
} from './productApi';
import { ProductTileProvider, SingleImageProvider } from './productTiles';
import { WindField } from './windField';
import { frameFeedFor, type FrameFeed } from './frameFeed';

/** What the map shows of a product layer, for the rail and the legend. */
export interface ProductLayerStatus {
  /** `loading` until its frame is drawn; `error` when it cannot be. */
  state: 'loading' | 'ready' | 'error';
  message?: string;
  /** The valid time of the frame drawn. */
  time?: string;
  /** Barbs or particles drawn now. */
  count?: number;
  /** The loop, while one plays. */
  loop?: LoopStatus;
}

/** A playing loop: its frames and the one shown. */
export interface LoopStatus {
  state: 'loading' | 'playing' | 'error';
  frames: number;
  /** The frame shown, from 0. */
  index: number;
  /** Its valid time. */
  time?: string;
  message?: string;
}

/** The ways a product can be drawn: its raster (the speed raster, for a wind field), barbs, particles. */
export type ProductFacet = 'raster' | 'barbs' | 'particles';

/** A drawn product layer's key: the product id for its raster, `id:facet` for barbs and particles. */
export function productLayerKey(productId: string, facet: ProductFacet): string {
  return facet === 'raster' ? productId : `${productId}:${facet}`;
}

/** Reads a {@link productLayerKey}. */
export function parseProductLayerKey(key: string): { productId: string; facet: ProductFacet } {
  const [productId = key, facet] = key.split(':');
  return { productId, facet: facet === 'barbs' || facet === 'particles' ? facet : 'raster' };
}

/** Opacity of a product raster without its own `render.defaultOpacity`: the night lights show through. */
export const DEFAULT_PRODUCT_OPACITY = 0.7;

/** The message for a failure, from an API problem's detail when there is one. */
function describe(error: unknown): string {
  if (error instanceof FsError) return error.detail ?? error.title ?? error.message;
  return error instanceof Error ? error.message : String(error);
}

/** While the live stream is connected, how often a product is still polled, as a safety net. */
export const LIVE_POLL_MS = 10 * 60_000;

/**
 * Follows a product's newest frame and calls `onFrame` with each new concrete frame, so the map
 * draws that frame's own content-addressed URLs, never the `latest` alias. New frames come from the
 * live stream's `raster-frame` changes (011, through {@link frameFeedFor}); `getLatestProductFrame`
 * is asked now and then again every half cadence (at most a minute) — or only every
 * {@link LIVE_POLL_MS} while the stream is live. A frame older than the one drawn is ignored.
 */
export class FrameWatcher {
  private timer?: ReturnType<typeof setTimeout>;
  private readonly controller = new AbortController();
  private frameKey?: string;
  private time?: string;
  private readonly feed: FrameFeed;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly api: ForesignalClient,
    private readonly product: Product,
    private readonly onFrame: (frame: RasterFrame) => void,
    private readonly onError: (message: string) => void,
  ) {
    this.feed = frameFeedFor(api);
    this.unsubscribe = this.feed.subscribe(product.id, (frame) => this.take(frame));
    void this.poll();
  }

  /** Stops polling and listening. */
  destroy(): void {
    clearTimeout(this.timer);
    this.controller.abort();
    this.unsubscribe();
  }

  /** Draws a frame if it is new and not older than the one drawn. */
  private take(frame: RasterFrame): void {
    if (this.controller.signal.aborted || frame.frameKey === this.frameKey) return;
    if (this.time && Date.parse(frame.time) < Date.parse(this.time)) return;
    this.frameKey = frame.frameKey;
    this.time = frame.time;
    this.onFrame(frame);
  }

  private async poll(): Promise<void> {
    try {
      this.take(await loadLatestFrame(this.api, this.product.id, this.controller.signal));
    } catch (error) {
      if (this.controller.signal.aborted) return;
      this.onError(describe(error));
    }
    if (this.controller.signal.aborted) return;
    const wait = this.feed.live ? LIVE_POLL_MS : pollInterval(this.product.temporal?.cadence);
    this.timer = setTimeout(() => void this.poll(), wait);
  }
}

/** How long an outgoing frame stays under its replacement, so a new frame never blinks in. */
const SWAP_MS = 3_000;

/** One loop frame's time on screen, and how many steps the last frame holds. */
export const LOOP_STEP_MS = 500;
const LOOP_HOLD_STEPS = 4;

/** Loop images fetched at once. */
const LOOP_FETCHES = 4;

/**
 * A product raster as a Cesium imagery layer: its newest frame from the frame's own tile template
 * ({@link ProductTileProvider}), swapped in when a new frame arrives, at the product's opacity over
 * the basemap. While its loop plays, the tiles are hidden and the loop's frames are shown in turn.
 */
export class ProductRasterLayer {
  private readonly watcher: FrameWatcher;
  private layer?: ImageryLayer;
  private provider?: ProductTileProvider;
  private readonly retiring = new Set<ReturnType<typeof setTimeout>>();
  private status: ProductLayerStatus = { state: 'loading' };
  private loop?: LoopPlayer;
  private tilesDrawn = 0;
  readonly alpha: number;

  constructor(
    private readonly viewer: Viewer,
    private readonly api: ForesignalClient,
    private readonly product: Product,
    private readonly onStatus: (status: ProductLayerStatus) => void,
  ) {
    this.alpha = product.render?.defaultOpacity ?? DEFAULT_PRODUCT_OPACITY;
    this.watcher = new FrameWatcher(
      api,
      product,
      (frame) => this.draw(frame),
      (message) => this.report({ state: 'error', message }),
    );
  }

  /** Plays the loop over `viewport`, or stops it (undefined), showing the newest frame's tiles. */
  setLoop(viewport: CommittedViewport | undefined): void {
    if (!viewport) {
      if (!this.loop) return;
      this.loop.destroy();
      this.loop = undefined;
      if (this.layer) this.layer.show = true;
      this.report({ loop: undefined });
      return;
    }
    if (!this.loop) {
      this.loop = new LoopPlayer(this.viewer, this.api, this.product, this.alpha, (loop) => {
        // Tiles show until the first loop frame is ready to take their place.
        if (this.layer) this.layer.show = loop.state !== 'playing';
        this.report({ loop });
      });
    }
    this.loop.load(viewport);
  }

  /** Removes the layer and its loop. */
  destroy(): void {
    this.watcher.destroy();
    this.loop?.destroy();
    for (const timer of this.retiring) clearTimeout(timer);
    this.provider?.destroy();
    if (this.layer && !this.viewer.isDestroyed()) this.viewer.imageryLayers.remove(this.layer);
  }

  private draw(frame: RasterFrame): void {
    if (this.viewer.isDestroyed()) return;
    const template = parseProductTileTemplate(frame.tiles);
    if (!template) {
      this.report({ state: 'error', message: 'The frame has no usable tile template.' });
      return;
    }
    const spatial = this.product.spatial;
    this.tilesDrawn = 0;
    const provider = new ProductTileProvider({
      api: this.api,
      template,
      minimumLevel: spatial?.minZoom ?? 0,
      maximumLevel: spatial?.maxZoom ?? 8,
      bounds: frame.bounds ?? spatial?.bounds,
      onTile: () => this.tilesDrawn++,
      onError: (message) => {
        if (this.tilesDrawn === 0) this.report({ state: 'error', message });
      },
    });
    const layer = new ImageryLayer(provider, { alpha: this.alpha, show: !this.loop });
    this.viewer.imageryLayers.add(layer);
    const old = { layer: this.layer, provider: this.provider };
    if (old.layer) {
      const timer = setTimeout(() => {
        this.retiring.delete(timer);
        old.provider?.destroy();
        if (!this.viewer.isDestroyed()) this.viewer.imageryLayers.remove(old.layer!);
      }, SWAP_MS);
      this.retiring.add(timer);
    }
    this.layer = layer;
    this.provider = provider;
    this.report({ state: 'ready', time: frame.time, message: undefined });
  }

  private report(change: Partial<ProductLayerStatus>): void {
    this.status = { ...this.status, ...change };
    this.onStatus(this.status);
  }
}

/**
 * A product's animation loop over a viewport (`getProductLoop`): its frames, fetched through the
 * API client, re-projected to latitude/longitude and draped as one imagery layer each, shown one
 * after another every {@link LOOP_STEP_MS}, the newest held a little longer. Frames past their
 * `expiresAt` are dropped. A new viewport loads a new loop.
 */
class LoopPlayer {
  private controller?: AbortController;
  private layers: { frame: LoopFrame; layer: ImageryLayer }[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private step = 0;
  private viewportKey?: string;

  constructor(
    private readonly viewer: Viewer,
    private readonly api: ForesignalClient,
    private readonly product: Product,
    private readonly alpha: number,
    private readonly onStatus: (status: LoopStatus) => void,
  ) {}

  /** Loads the loop for a viewport, unless it is the one already playing. */
  load(viewport: CommittedViewport): void {
    const key = viewport.bbox.join(',');
    if (key === this.viewportKey) return;
    this.viewportKey = key;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.onStatus({ state: 'loading', frames: 0, index: 0 });
    void this.fetch(viewport, controller.signal).then(
      (layers) => {
        if (controller.signal.aborted || this.viewer.isDestroyed()) {
          layers.forEach(({ layer }) => this.viewer.imageryLayers.remove(layer));
          return;
        }
        this.clear();
        this.layers = layers;
        layers.forEach(({ layer }) => this.viewer.imageryLayers.add(layer));
        this.step = 0;
        this.timer = setInterval(() => this.advance(), LOOP_STEP_MS);
        this.advance();
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        this.viewportKey = undefined;
        this.onStatus({ state: 'error', frames: 0, index: 0, message: describe(error) });
      },
    );
  }

  /** Stops the loop and removes its frames. */
  destroy(): void {
    this.controller?.abort();
    this.clear();
  }

  private clear(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    if (!this.viewer.isDestroyed()) {
      for (const { layer } of this.layers) this.viewer.imageryLayers.remove(layer);
    }
    this.layers = [];
  }

  /** Fetches and prepares the loop's frames, oldest first. */
  private async fetch(
    viewport: CommittedViewport,
    signal: AbortSignal,
  ): Promise<{ frame: LoopFrame; layer: ImageryLayer }[]> {
    const width = this.viewer.scene.canvas.clientWidth || 1024;
    const loop = await loadLoop(this.api, this.product.id, viewport, width, signal);
    const frames = liveFrames(loop.frames, Date.now()).sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time),
    );
    if (frames.length === 0) throw new Error('The loop has no frames to play.');
    const [west, south, east, north] = loop.bounds as [number, number, number, number];
    const rectangle = Rectangle.fromDegrees(west, south, east, north);
    const out: { frame: LoopFrame; layer: ImageryLayer }[] = new Array(frames.length);
    let next = 0;
    const worker = async () => {
      while (next < frames.length) {
        const index = next++;
        const frame = frames[index]!;
        const blob = await fetchLoopImage(this.api, frame, signal);
        const bitmap = await createImageBitmap(blob);
        const image = reprojectToGeographic(bitmap, loop.bounds);
        bitmap.close();
        out[index] = {
          frame,
          // Shown but transparent: Cesium loads every frame's texture up front and skips drawing
          // it, so each frame is ready the moment its turn comes.
          layer: new ImageryLayer(new SingleImageProvider(image, rectangle), { alpha: 0 }),
        };
      }
    };
    await Promise.all(Array.from({ length: LOOP_FETCHES }, worker));
    return out;
  }

  /** Shows the next frame; drops frames that have expired. */
  private advance(): void {
    const now = Date.now();
    const expired = this.layers.filter(
      ({ frame }) => frame.expiresAt && Date.parse(frame.expiresAt) <= now,
    );
    for (const { layer } of expired) this.viewer.imageryLayers.remove(layer);
    if (expired.length) this.layers = this.layers.filter((entry) => !expired.includes(entry));
    const count = this.layers.length;
    if (count === 0) {
      this.onStatus({ state: 'error', frames: 0, index: 0, message: 'Every loop frame expired.' });
      clearInterval(this.timer);
      return;
    }
    const cycle = count + LOOP_HOLD_STEPS - 1;
    const index = Math.min(count - 1, this.step % cycle);
    this.step++;
    this.layers.forEach(({ layer }, i) => {
      layer.alpha = i === index ? this.alpha : 0;
    });
    this.onStatus({ state: 'playing', frames: count, index, time: this.layers[index]!.frame.time });
  }
}

/** How long the camera must rest before wind barbs load for the new view, in ms. */
const VIEW_SETTLE_MS = 200;
/** Most barb tiles one view requests. */
const MAX_BARB_TILES = 32;
/** Barb tiles fetched at once. */
const BARB_FETCHES = 6;

/**
 * Wind barbs from a wind product's vector tiles (`getProductVectorTile`, layer `wind`): one
 * billboard per point, its glyph from the point's 5-kt `barbKt` bucket, rotated by `fromDeg` and
 * north-aligned, so it turns with the map. Tiles follow the view at its zoom (deeper than the
 * product's own maximum, the deepest tiles are reused); every billboard is in one collection.
 */
export class WindBarbLayer {
  private readonly watcher: FrameWatcher;
  private readonly billboards: BillboardCollection;
  private readonly drawn = new Map<string, Billboard[]>();
  private readonly removers: (() => void)[] = [];
  private readonly glyphs = new Map<number, HTMLCanvasElement>();
  private frame?: RasterFrame;
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private status: ProductLayerStatus = { state: 'loading' };

  constructor(
    private readonly viewer: Viewer,
    private readonly api: ForesignalClient,
    private readonly product: Product,
    private readonly onStatus: (status: ProductLayerStatus) => void,
  ) {
    this.billboards = viewer.scene.primitives.add(new BillboardCollection({ scene: viewer.scene }));
    const schedule = () => this.schedule();
    this.removers.push(
      viewer.camera.moveEnd.addEventListener(schedule),
      viewer.scene.morphComplete.addEventListener(schedule),
    );
    this.watcher = new FrameWatcher(
      api,
      product,
      (frame) => {
        this.frame = frame;
        this.clearTiles();
        this.schedule();
      },
      (message) => this.report({ state: 'error', message }),
    );
  }

  /** Removes the barbs. */
  destroy(): void {
    this.watcher.destroy();
    this.controller?.abort();
    clearTimeout(this.timer);
    this.removers.forEach((remove) => remove());
    if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.billboards);
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.viewer.isDestroyed() || this.viewer.scene.mode === SceneMode.MORPHING) return;
      void this.update(readRecordView(this.viewer));
    }, VIEW_SETTLE_MS);
  }

  private async update(view: RecordView): Promise<void> {
    const frame = this.frame;
    if (!frame) return;
    const spatial = this.product.spatial;
    const tiles = planTiles({
      rect: view.rect,
      zoom: view.zoom,
      minzoom: spatial?.minZoom ?? 0,
      maxzoom: spatial?.maxZoom ?? 8,
      bounds: boundsRect(frame.bounds ?? spatial?.bounds),
      maxTiles: MAX_BARB_TILES,
    });
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const wanted = new Set(tiles.map(tileKey));
    const missing = tiles.filter((tile) => !this.drawn.has(tileKey(tile)));
    let failure: string | undefined;
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const tile = missing[next++]!;
        try {
          const data = await fetchWindTile(this.api, frame, tile, controller.signal);
          if (controller.signal.aborted) return;
          this.drawTile(tile, data);
        } catch (error) {
          if (controller.signal.aborted) return;
          failure = describe(error);
        }
      }
    };
    await Promise.all(Array.from({ length: BARB_FETCHES }, worker));
    if (controller.signal.aborted) return;
    // The old view's barbs go once the new view's are in, so panning does not blink.
    for (const key of [...this.drawn.keys()]) if (!wanted.has(key)) this.removeTile(key);
    const count = [...this.drawn.values()].reduce((sum, list) => sum + list.length, 0);
    if (failure && count === 0) this.report({ state: 'error', message: failure, count });
    else this.report({ state: 'ready', time: frame.time, count, message: undefined });
  }

  private drawTile(tile: TileId, data: ArrayBuffer): void {
    const list: Billboard[] = [];
    const ratio = window.devicePixelRatio || 1;
    for (const feature of decodeTile(data, tile)) {
      if (feature.geometry.type !== 'point') continue;
      const knots = Number(feature.properties.barbKt ?? 0);
      const from = Number(feature.properties.fromDeg ?? 0);
      let glyph = this.glyphs.get(knots);
      if (!glyph) {
        glyph = drawBarb(knots, ratio);
        this.glyphs.set(knots, glyph);
      }
      for (const [lon, lat] of feature.geometry.points) {
        const billboard = this.billboards.add({
          position: Cartesian3.fromDegrees(lon, lat),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          verticalOrigin: VerticalOrigin.BOTTOM,
          width: BARB_SIZE.width,
          height: BARB_SIZE.height,
          // The glyph points north; it turns clockwise to where the wind blows from.
          rotation: -CesiumMath.toRadians(from),
          alignedAxis: Cartesian3.UNIT_Z,
          id: { product: this.product.id, speedMs: feature.properties.speedMs, fromDeg: from },
        });
        billboard.setImage(`barb-${knots}`, glyph);
        list.push(billboard);
      }
    }
    this.drawn.set(tileKey(tile), list);
  }

  private removeTile(key: string): void {
    for (const billboard of this.drawn.get(key) ?? []) this.billboards.remove(billboard);
    this.drawn.delete(key);
  }

  private clearTiles(): void {
    for (const key of [...this.drawn.keys()]) this.removeTile(key);
  }

  private report(change: Partial<ProductLayerStatus>): void {
    this.status = { ...this.status, ...change };
    this.onStatus(this.status);
  }
}

/** Particles drawn at once. */
export const PARTICLE_COUNT = 1200;
/** Height particles are drawn at in 3D, in meters, so the raised relief does not hide them. */
const PARTICLE_HEIGHT = 12_000;
/** Particles' color: white, so the flow reads over the speed raster and over the basemap. */
const PARTICLE_COLOR = Color.WHITE.withAlpha(0.8);

/**
 * Animated wind particles from a wind product's field (`getProductFieldManifest`, then its png-uv
 * encoding `getProductFieldPngUv`): {@link ParticleSystem} advects them on the CPU every frame and
 * each one's trail is a polyline in one Cesium `PolylineCollection`, all sharing one white material
 * so they are drawn together (a material each costs a draw each); a faster particle moves faster
 * and so leaves a longer trail. The particles live in the view and move at a constant on-screen speed per
 * m/s, so the flow reads the same at every zoom.
 */
export class WindParticleLayer {
  private readonly watcher: FrameWatcher;
  private readonly polylines: PolylineCollection;
  private readonly removers: (() => void)[] = [];
  private readonly controller = new AbortController();
  private system?: ParticleSystem;
  private lines: Polyline[] = [];
  /**
   * The one material every trail shares. A polyline destroys its material when it is destroyed,
   * which would destroy this one once per particle (and throw from the second time on, stopping
   * the map's rendering), so its own `destroy` is a no-op here and the layer destroys it once.
   */
  private readonly material = Material.fromType('Color', { color: PARTICLE_COLOR });
  private readonly destroyMaterial = this.material.destroy.bind(this.material);
  private readonly positions: Cartesian3[][] = [];
  private last = 0;
  private degreesPerPixel = 0.1;
  private status: ProductLayerStatus = { state: 'loading' };

  constructor(
    private readonly viewer: Viewer,
    private readonly api: ForesignalClient,
    product: Product,
    private readonly onStatus: (status: ProductLayerStatus) => void,
  ) {
    this.polylines = viewer.scene.primitives.add(new PolylineCollection());
    this.material.destroy = () => undefined;
    const onView = () => this.readView();
    this.removers.push(
      viewer.camera.moveEnd.addEventListener(onView),
      viewer.scene.morphComplete.addEventListener(onView),
      viewer.scene.preRender.addEventListener(() => this.animate()),
    );
    this.watcher = new FrameWatcher(
      api,
      product,
      (frame) => void this.load(frame),
      (message) => this.report({ state: 'error', message }),
    );
  }

  /** Removes the particles. */
  destroy(): void {
    this.watcher.destroy();
    this.controller.abort();
    this.removers.forEach((remove) => remove());
    if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.polylines);
    this.destroyMaterial();
  }

  /** Loads a frame's field and starts (or restarts) the particles on it. */
  private async load(frame: RasterFrame): Promise<void> {
    try {
      const signal = this.controller.signal;
      const manifest = await loadFieldManifest(this.api, frame, signal);
      const encoding = manifest.encodings?.pngUv;
      if (manifest.unavailable || !encoding?.url) {
        throw new Error(manifest.reason ?? 'The field has no png-uv encoding.');
      }
      const blob = await fetchFieldPng(this.api, encoding.url, signal);
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      if (signal.aborted || this.viewer.isDestroyed()) return;
      const field = new WindField(pixels, canvas.width, canvas.height, encoding);
      this.system = new ParticleSystem(field, PARTICLE_COUNT);
      this.readView();
      this.report({ state: 'ready', time: frame.time, count: PARTICLE_COUNT, message: undefined });
    } catch (error) {
      if (this.controller.signal.aborted) return;
      this.report({ state: 'error', message: describe(error) });
    }
  }

  /** Reads the view: where the particles live and the scale that sets their speed. */
  private readView(): void {
    if (this.viewer.isDestroyed() || this.viewer.scene.mode === SceneMode.MORPHING) return;
    const view = readRecordView(this.viewer);
    // Degrees per CSS pixel at the view's zoom: 512-pixel tiles span 360 / 2^zoom degrees.
    this.degreesPerPixel = 360 / (512 * 2 ** view.zoom);
    this.system?.setRect(view.rect);
  }

  /** Moves the particles one frame on and redraws their trails. */
  private animate(): void {
    const system = this.system;
    if (!system) return;
    const now = performance.now();
    const seconds = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    system.step(seconds, this.degreesPerPixel);
    const flat = this.viewer.scene.mode !== SceneMode.SCENE3D;
    const height = flat ? 0 : PARTICLE_HEIGHT;
    system.particles.forEach((particle, i) => {
      let line = this.lines[i];
      if (!line) {
        line = this.polylines.add({ width: 2, material: this.material });
        this.lines[i] = line;
      }
      // Always TRAIL_LENGTH positions: a polyline whose position count changes makes Cesium
      // rebuild the whole collection's buffers, which, with particles reborn every frame, it
      // would do every frame. A short trail repeats its oldest point, each repeat a centimeter
      // higher, as Cesium drops points that coincide.
      const trail = particle.trail;
      const positions = (this.positions[i] ??= Array.from(
        { length: TRAIL_LENGTH },
        () => new Cartesian3(),
      ));
      const missing = TRAIL_LENGTH - trail.length;
      for (let k = 0; k < TRAIL_LENGTH; k++) {
        const [lon, lat] = trail[Math.max(0, k - missing)]!;
        const lift = k < missing ? (missing - k) * 0.01 : 0;
        Cartesian3.fromDegrees(lon, lat, height + lift, undefined, positions[k]);
      }
      line.positions = positions;
    });
  }

  private report(change: Partial<ProductLayerStatus>): void {
    this.status = { ...this.status, ...change };
    this.onStatus(this.status);
  }
}

/** `[west, south, east, north]` as a rectangle in degrees, or undefined. */
function boundsRect(bounds: readonly number[] | null | undefined) {
  if (!bounds || bounds.length !== 4) return undefined;
  const [west, south, east, north] = bounds as [number, number, number, number];
  return { west, south, east, north };
}
