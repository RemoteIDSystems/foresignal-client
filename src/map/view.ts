import { Cartesian3, Color, type Viewer as CesiumViewer } from 'cesium';
import { applySceneMode, type MorphableScene, type SceneModeKey } from './sceneMode';

/** The default view: the western Atlantic and North America, as in the primary mockup. */
export const HOME_VIEW = { longitude: -80, latitude: 28, height: 13_000_000 } as const;

/** {@link HOME_VIEW} as a Cesium camera destination. */
export function homeDestination(): Cartesian3 {
  return Cartesian3.fromDegrees(HOME_VIEW.longitude, HOME_VIEW.latitude, HOME_VIEW.height);
}

/** Returns true when this browser can create a WebGL context. */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Applies the dark theme to a viewer's scene: space and the globe's no-imagery color. */
export function styleScene(viewer: CesiumViewer): void {
  viewer.scene.backgroundColor = Color.fromCssColorString('#02060c');
  viewer.scene.globe.baseColor = Color.fromCssColorString('#0b1a2a');
}

/** A place to look at: a ground point and a camera height above it. */
export interface GroundView {
  /** Longitude, degrees. */
  longitude: number;
  /** Latitude, degrees. */
  latitude: number;
  /** Camera height, meters. */
  height: number;
}

/** The members of a viewer that {@link switchSceneMode} uses; matches Cesium's `Viewer`. */
export interface SwitchableViewer {
  /** The scene to morph, with its morph-complete event. */
  scene: MorphableScene & {
    morphComplete: { addEventListener(listener: () => void): () => void };
  };
  /** The camera to put back over `keep` once the morph is done. */
  camera: { setView(options: { destination: Cartesian3 }): void };
}

/**
 * Switches the map between 2D and 3D and keeps the user's place. Cesium's morph resets the camera
 * to a whole-world view; when `keep` is given, the camera is put back over the same ground point at
 * the same height as soon as the morph completes. Returns false when already in that mode.
 */
export function switchSceneMode(
  viewer: SwitchableViewer,
  key: SceneModeKey,
  keep: GroundView | undefined,
  duration = 1,
): boolean {
  const remove = keep
    ? viewer.scene.morphComplete.addEventListener(() => {
        remove?.();
        viewer.camera.setView({
          destination: Cartesian3.fromDegrees(keep.longitude, keep.latitude, keep.height),
        });
      })
    : undefined;
  const changed = applySceneMode(viewer.scene, key, duration);
  if (!changed) remove?.();
  return changed;
}
