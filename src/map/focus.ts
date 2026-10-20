import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  SceneMode,
  SceneTransforms,
  type Viewer,
} from 'cesium';

/** How far from a 3D item the camera settles, in meters, looking down at 50°. */
const THREE_D_RANGE_M = 2_500_000;

/** The part of the canvas, from its center, in which a 2D item counts as in view. */
const IN_VIEW_FRACTION = 0.3;

/** The highest a 2D focus leaves the camera, in meters. */
const MAX_2D_HEIGHT_M = 8_000_000;

/**
 * Brings a selected item into view (014's contextual 3D). An item with a 3D view switches the map
 * to the 3D globe (through `setScene`, so the store holds it) and, once there, flies to look down on
 * it at an angle. Any other item keeps the map as it is and is centered, at the current height,
 * unless it is already near the middle of the view: picking a record on the map does not move it.
 * Returns a function that cancels a flight still waiting for the switch.
 */
export function focusOn(
  viewer: Viewer,
  at: { longitude: number; latitude: number },
  threeD: boolean,
  setScene: (mode: '3d') => void,
): () => void {
  const { camera, scene } = viewer;
  const target = Cartesian3.fromDegrees(at.longitude, at.latitude);
  const fly = () => {
    if (viewer.isDestroyed()) return;
    if (threeD) {
      camera.flyToBoundingSphere(new BoundingSphere(target, 10_000), {
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-50), THREE_D_RANGE_M),
        duration: 1.5,
      });
      return;
    }
    if (inView(viewer, target)) return;
    const height = Math.min(camera.positionCartographic.height, MAX_2D_HEIGHT_M);
    camera.flyTo({
      destination: Cartesian3.fromDegrees(at.longitude, at.latitude, height),
      duration: 1,
    });
  };
  if (threeD && scene.mode !== SceneMode.SCENE3D) {
    const remove = scene.morphComplete.addEventListener(() => {
      remove();
      fly();
    });
    setScene('3d');
    return remove;
  }
  fly();
  return () => {};
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
    duration: 1,
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
