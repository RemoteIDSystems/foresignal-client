import { Cartesian3, Color, type Viewer as CesiumViewer } from 'cesium';

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
