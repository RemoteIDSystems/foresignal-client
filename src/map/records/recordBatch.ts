import {
  BillboardCollection,
  BlendOption,
  GroundPolylinePrimitive,
  HeightReference,
  GroundPrimitive,
  PerInstanceColorAppearance,
  PolylineColorAppearance,
  Primitive,
  type GeometryInstance,
  type Scene,
} from 'cesium';

/** How long a change waits for others before the merged primitive is rebuilt, in ms. */
export const MERGE_MS = 80;

/** What a merged primitive is added to and removed from: a scene's primitive collection. */
export interface PrimitiveHost {
  add(primitive: unknown): unknown;
  remove(primitive: unknown): boolean;
}

/** A primitive the batch builds: Cesium sets `ready` once its geometry is built. */
export interface Buildable {
  readonly ready: boolean;
}

/** Calls `callback` after every rendered frame until the returned function is called. */
export type FrameHook = (callback: () => void) => () => void;

/**
 * Geometry instances from many owners (one layer's tile, one layer's cells) drawn as a single
 * Cesium primitive, so the scene issues one set of draw commands for all of them rather than one per
 * tile per layer. Owners set and delete their instances; changes within {@link MERGE_MS} are built
 * together, and while a build is in flight further changes wait for it, so a burst of tiles from a
 * full catalog of layers costs a few builds, not one per tile. The primitive drawn before stays
 * until its replacement is ready, so a rebuild never blinks. Instances are not changed by building
 * (Cesium copies them into its workers), so an owner's instances are reused by every rebuild.
 */
export class MergedPrimitive<P extends Buildable> {
  private readonly parts = new Map<string, GeometryInstance[]>();
  private current?: P;
  /** Instances in the primitive drawn now. */
  private currentCount = 0;
  private building?: P;
  /** Instances in the primitive being built. */
  private buildingCount = 0;
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private stopWaiting?: () => void;
  private destroyed = false;
  /** Told once what is set now is drawn ({@link whenBuilt}). */
  private waiting: (() => void)[] = [];
  /** Builds started, for tests and the stress harness. */
  builds = 0;

  /**
   * @param host Where the primitive is added.
   * @param build Makes the primitive for a set of instances.
   * @param onFrame Subscribes to rendered frames, to see when a build is ready.
   * @param delay How long changes are gathered before a build, in ms.
   */
  constructor(
    private readonly host: PrimitiveHost,
    private readonly build: (instances: GeometryInstance[]) => P,
    private readonly onFrame: FrameHook,
    private readonly delay = MERGE_MS,
  ) {}

  /** Sets an owner's instances, replacing what it had; none removes the owner. */
  set(owner: string, instances: GeometryInstance[]): void {
    if (instances.length === 0) {
      this.delete(owner);
      return;
    }
    this.parts.set(owner, instances);
    this.schedule();
  }

  /** Removes an owner's instances. */
  delete(owner: string): void {
    if (this.parts.delete(owner)) this.schedule();
  }

  /** Removes every owner whose id starts with `prefix` (a layer's tiles), with one rebuild. */
  deletePrefix(prefix: string): void {
    let changed = false;
    for (const owner of [...this.parts.keys()]) {
      if (owner.startsWith(prefix)) changed = this.parts.delete(owner) || changed;
    }
    if (changed) this.schedule();
  }

  /** Instances drawn, or about to be, across owners. */
  get instanceCount(): number {
    let total = 0;
    for (const instances of this.parts.values()) total += instances.length;
    return total;
  }

  /** Instances in the primitive on the map now (not one still building). */
  get drawnCount(): number {
    return this.current ? this.currentCount : 0;
  }

  /** True while changes wait for a build or a build is in flight. */
  get pending(): boolean {
    return this.dirty || this.building !== undefined;
  }

  /**
   * Calls `callback` once every instance set so far is drawn: at once when nothing is pending,
   * else when the build that holds them is ready (or nothing is left to draw). So something drawn
   * elsewhere can stay until its replacement here shows, and the change does not blink.
   */
  whenBuilt(callback: () => void): void {
    if (!this.pending) {
      callback();
      return;
    }
    this.waiting.push(callback);
  }

  /** Removes the primitives and stops building. */
  destroy(): void {
    this.destroyed = true;
    this.waiting = [];
    clearTimeout(this.timer);
    this.stopWaiting?.();
    if (this.building) this.host.remove(this.building);
    if (this.current) this.host.remove(this.current);
    this.building = undefined;
    this.current = undefined;
  }

  private schedule(): void {
    this.dirty = true;
    if (this.timer !== undefined || this.building !== undefined || this.destroyed) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.rebuild();
    }, this.delay);
  }

  private rebuild(): void {
    if (this.destroyed) return;
    this.dirty = false;
    const instances = [...this.parts.values()].flat();
    if (instances.length === 0) {
      if (this.current) this.host.remove(this.current);
      this.current = undefined;
      this.currentCount = 0;
      this.flushWaiting();
      return;
    }
    this.builds++;
    const next = this.host.add(this.build(instances)) as P;
    this.building = next;
    this.buildingCount = instances.length;
    this.stopWaiting = this.onFrame(() => {
      if (!next.ready) return;
      this.stopWaiting?.();
      this.stopWaiting = undefined;
      if (this.current) this.host.remove(this.current);
      this.current = next;
      this.currentCount = this.buildingCount;
      this.building = undefined;
      if (this.dirty) {
        this.dirty = false;
        this.schedule();
      } else {
        this.flushWaiting();
      }
    });
  }

  /** Tells those waiting that what was set is drawn. */
  private flushWaiting(): void {
    if (this.pending) return;
    const waiting = this.waiting;
    this.waiting = [];
    for (const callback of waiting) callback();
  }
}

/**
 * What every record layer on a viewer draws into, shared so the whole catalog costs a handful of
 * draw calls: one billboard collection for every layer's points (one texture atlas, each distinct
 * symbol stored once, drawn in one translucent pass), one ground primitive for every layer's polygon fills and one ground polyline
 * primitive for their lines and outlines, and one primitive each for every layer's aggregate cell
 * fills and outlines (cells sit on the ellipsoid; see `RecordLayer`).
 */
export class RecordBatch {
  readonly points: BillboardCollection;
  readonly fills: MergedPrimitive<GroundPrimitive>;
  readonly lines: MergedPrimitive<GroundPolylinePrimitive>;
  readonly cellFills: MergedPrimitive<Primitive>;
  readonly cellLines: MergedPrimitive<Primitive>;
  private clamped = true;

  /** @param scene The scene to draw into. */
  constructor(private readonly scene: Scene) {
    // One translucent pass: the symbols' antialiased edges and halos are translucent anyway, and
    // the default opaque-then-translucent pair draws every point twice.
    this.points = scene.primitives.add(
      new BillboardCollection({ scene, blendOption: BlendOption.TRANSLUCENT }),
    ) as BillboardCollection;
    const onFrame: FrameHook = (callback) => scene.postRender.addEventListener(callback);
    const ground = scene.groundPrimitives as unknown as PrimitiveHost;
    const above = scene.primitives as unknown as PrimitiveHost;
    this.fills = new MergedPrimitive(
      ground,
      (geometryInstances) =>
        new GroundPrimitive({
          geometryInstances,
          appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
          asynchronous: true,
        }),
      onFrame,
    );
    this.lines = new MergedPrimitive(
      ground,
      (geometryInstances) =>
        new GroundPolylinePrimitive({
          geometryInstances,
          appearance: new PolylineColorAppearance(),
          asynchronous: true,
        }),
      onFrame,
    );
    this.cellFills = new MergedPrimitive(
      above,
      (geometryInstances) =>
        new Primitive({
          geometryInstances,
          appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
          asynchronous: true,
        }),
      onFrame,
    );
    this.cellLines = new MergedPrimitive(
      above,
      (geometryInstances) =>
        new Primitive({
          geometryInstances,
          appearance: new PolylineColorAppearance({ translucent: true }),
          asynchronous: true,
        }),
      onFrame,
    );
  }

  /** How points are placed now: clamped to the terrain, or on the ellipsoid. */
  get heightReference(): HeightReference {
    return this.clamped ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE;
  }

  /**
   * Clamps every point to the terrain (the 3D globe, where the relief is raised) or not (the flat
   * 2D map, where the height is not seen). A clamped point is moved each time the terrain under it
   * loads, which rewrites it in the collection's buffers; over a full catalog of points, panning the
   * 2D map paid that every frame for nothing.
   */
  setClamped(clamped: boolean): void {
    if (clamped === this.clamped) return;
    this.clamped = clamped;
    const reference = this.heightReference;
    for (let i = 0; i < this.points.length; i++) this.points.get(i).heightReference = reference;
  }

  /** The merged primitives, for counting and tidying up. */
  get merged(): MergedPrimitive<Buildable>[] {
    return [this.fills, this.lines, this.cellFills, this.cellLines];
  }

  /** Removes everything from the scene. */
  destroy(): void {
    for (const merged of this.merged) merged.destroy();
    if (!this.scene.isDestroyed()) this.scene.primitives.remove(this.points);
  }
}
