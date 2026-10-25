import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  Rectangle,
  SceneMode,
  SceneTransforms,
  type Viewer,
} from 'cesium';
import { motionSeconds } from '../lib/motion';

/** How far from a 3D item the camera settles, in meters, looking down at 50°. */
const THREE_D_RANGE_M = 2_500_000;

/** The part of the canvas, from its center, in which a 2D item counts as in view. */
const IN_VIEW_FRACTION = 0.3;

/** The highest a 2D focus leaves the camera, in meters. */
const MAX_2D_HEIGHT_M = 8_000_000;

/**
 * Brings a selected item into view without changing the scene mode: switching between the 2D map
 * and the 3D globe is the user's, through the toggle. On the 3D globe an item with a 3D view is
 * looked down on at an angle; any other item, and every item on the 2D map, is centered at the
 * current height, unless it is already near the middle of the view: picking a record on the map
 * does not move it.
 */
export function focusOn(
  viewer: Viewer,
  at: { longitude: number; latitude: number },
  threeD: boolean,
): void {
  if (viewer.isDestroyed()) return;
  const { camera, scene } = viewer;
  const target = Cartesian3.fromDegrees(at.longitude, at.latitude);
  if (threeD && scene.mode === SceneMode.SCENE3D) {
    camera.flyToBoundingSphere(new BoundingSphere(target, 10_000), {
      offset: new HeadingPitchRange(0, CesiumMath.toRadians(-50), THREE_D_RANGE_M),
      duration: motionSeconds(1.5),
    });
    return;
  }
  if (inView(viewer, target)) return;
  const height = Math.min(camera.positionCartographic.height, MAX_2D_HEIGHT_M);
  camera.flyTo({
    destination: Cartesian3.fromDegrees(at.longitude, at.latitude, height),
    duration: motionSeconds(1),
  });
}

/**
 * Moves the camera over a place (017's search and find bar), from `height` meters, or from the
 * current height (at most {@link MAX_2D_HEIGHT_M}), looking straight down, in either scene mode.
 */
export function locateTo(
  viewer: Viewer,
  at: { longitude: number; latitude: number; height?: number },
): void {
  if (viewer.isDestroyed()) return;
  const height = at.height ?? Math.min(viewer.camera.positionCartographic.height, MAX_2D_HEIGHT_M);
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(at.longitude, at.latitude, height),
    duration: motionSeconds(1),
  });
}

/** True when a point shows within {@link IN_VIEW_FRACTION} of the canvas's center. */
function inView(viewer: Viewer, target: Cartesian3): boolean {
  const at = SceneTransforms.worldToWindowCoordinates(viewer.scene, target, new Cartesian2());
  if (!at) return false;
  const { clientWidth: width, clientHeight: height } = viewer.scene.canvas;
  return (
    Math.abs(at.x - width / 2) <= width * IN_VIEW_FRACTION &&
    Math.abs(at.y - height / 2) <= height * IN_VIEW_FRACTION
  );
}

/**
 * Zooms into an aggregate cell (the backend's or the client's, 037), as clustering does on a
 * click: the camera flies to fit the cell, so what it counts shows in finer cells or, past the
 * aggregation zoom, as records. `bounds` is `[west, south, east, north]` in degrees.
 */
export function expandCell(
  viewer: Pick<Viewer, 'camera' | 'isDestroyed'>,
  bounds: readonly [number, number, number, number],
): void {
  if (viewer.isDestroyed()) return;
  const [west, south, east, north] = bounds;
  viewer.camera.flyTo({
    destination: Rectangle.fromDegrees(west, south, east, north),
    duration: motionSeconds(1),
  });
}
