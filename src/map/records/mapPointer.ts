import {
  Cartesian2,
  EllipsoidGeodesic,
  Math as CesiumMath,
  SceneMode,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian3,
  type Viewer,
} from 'cesium';
import type { PickQuery, RecordHit } from './recordPicking';

/** Something that answers which records are under a point of the map. */
export interface PickSource {
  pick(query: PickQuery): RecordHit[];
}

/** Pixels apart the two points sampled for the scale at the pointer. */
const SCALE_SAMPLE_PX = 8;

/** What the pointer does with what it finds. */
export interface MapPointerHandlers {
  /** The record under the pointer as it moves, or undefined over nothing. */
  onHover(hit: RecordHit | undefined): void;
  /** The record clicked, or undefined for a click on nothing. */
  onSelect(hit: RecordHit | undefined): void;
}

/**
 * The map's pointer: hover and click picking of records for the whole viewer. It replaces
 * Cesium's own left-click and double-click actions (which run a GPU pick pass of the whole scene
 * on every click and select or fly to entities the map does not have) with picking on the CPU
 * against the drawn tiles ({@link PickSource}): the pointer is turned into a longitude, latitude
 * and ground scale, and only records in the tiles around it are tested. Hover is picked at most
 * once per animation frame and not while a button is held (a drag pans the map).
 */
export class MapPointer {
  private readonly handler: ScreenSpaceEventHandler;
  private pending?: Cartesian2;
  private frame?: number;
  private dragging = false;
  private hovered?: string;

  /**
   * @param viewer The viewer whose canvas the pointer moves over.
   * @param source Answers picks; undefined while nothing is drawn.
   * @param handlers Told of hovers and clicks.
   */
  constructor(
    private readonly viewer: Viewer,
    private readonly source: () => PickSource | undefined,
    private readonly handlers: MapPointerHandlers,
  ) {
    const own = viewer.screenSpaceEventHandler;
    own.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
    own.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    this.handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction(
      (event: ScreenSpaceEventHandler.MotionEvent) => this.move(event.endPosition),
      ScreenSpaceEventType.MOUSE_MOVE,
    );
    this.handler.setInputAction(() => {
      this.dragging = true;
    }, ScreenSpaceEventType.LEFT_DOWN);
    this.handler.setInputAction(() => {
      this.dragging = false;
    }, ScreenSpaceEventType.LEFT_UP);
    this.handler.setInputAction(
      (event: ScreenSpaceEventHandler.PositionedEvent) =>
        this.handlers.onSelect(this.pickAt(event.position)),
      ScreenSpaceEventType.LEFT_CLICK,
    );
  }

  /** Stops listening. */
  destroy(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    if (!this.handler.isDestroyed()) this.handler.destroy();
  }

  /** The topmost record at a canvas position, or undefined. */
  pickAt(position: Cartesian2): RecordHit | undefined {
    const source = this.source();
    const query = source && queryAt(this.viewer, position);
    return query ? source.pick(query)[0] : undefined;
  }

  private move(position: Cartesian2): void {
    if (this.dragging) return;
    this.pending = Cartesian2.clone(position, this.pending);
    this.frame ??= requestAnimationFrame(() => {
      this.frame = undefined;
      if (!this.pending || this.viewer.isDestroyed()) return;
      const hit = this.pickAt(this.pending);
      const key = hit ? hitKey(hit) : undefined;
      if (key === this.hovered) return;
      this.hovered = key;
      this.handlers.onHover(hit);
    });
  }
}

/** A stable identity for a hit, to tell the owner only when the hovered record changes. */
export function hitKey(hit: RecordHit): string {
  const { layer, source, externalId, count } = hit.id;
  return externalId !== undefined
    ? `${layer}|${source ?? ''}|${externalId}`
    : `${layer}|${hit.type}|${count ?? ''}|${hit.longitude.toFixed(4)},${hit.latitude.toFixed(4)}`;
}

/**
 * The pointer as a pick query: where it meets the ground (the terrain in 3D, where records sit on
 * the relief; the ellipsoid in 2D) and the ground meters a pixel spans there. Undefined over space.
 */
export function queryAt(viewer: Viewer, position: Cartesian2): PickQuery | undefined {
  const { scene, camera } = viewer;
  const ellipsoid = scene.globe.ellipsoid;
  let ground: Cartesian3 | undefined;
  if (scene.mode === SceneMode.SCENE3D) {
    const ray = camera.getPickRay(position);
    ground = ray ? scene.globe.pick(ray, scene) : undefined;
  }
  ground ??= camera.pickEllipsoid(position, ellipsoid);
  if (!ground) return undefined;
  const at = ellipsoid.cartesianToCartographic(ground);
  const a = camera.pickEllipsoid(position, ellipsoid);
  const b = camera.pickEllipsoid(
    new Cartesian2(position.x + SCALE_SAMPLE_PX, position.y),
    ellipsoid,
  );
  let metersPerPixel = 0;
  if (a && b) {
    metersPerPixel =
      new EllipsoidGeodesic(
        ellipsoid.cartesianToCartographic(a),
        ellipsoid.cartesianToCartographic(b),
        ellipsoid,
      ).surfaceDistance / SCALE_SAMPLE_PX;
  }
  if (!(metersPerPixel > 0)) return undefined;
  return {
    longitude: CesiumMath.toDegrees(at.longitude),
    latitude: CesiumMath.toDegrees(at.latitude),
    metersPerPixel,
  };
}
