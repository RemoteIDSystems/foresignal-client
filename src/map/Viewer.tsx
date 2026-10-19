import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Viewer as ResiumViewer, useCesium } from 'resium';
import {
  Cartesian2,
  EllipsoidGeodesic,
  Math as CesiumMath,
  type Viewer as CesiumViewer,
} from 'cesium';
import { createBaseLayer, insetTileUrls } from './imagery';
import { MapHud, type CameraState } from './MapHud';
import { niceScale } from './readout';
import { applySceneMode, type SceneModeKey } from './sceneMode';
import { homeDestination, styleScene, supportsWebGL } from './view';
import styles from './Viewer.module.css';

/** Widest scale bar, in CSS pixels. */
const SCALE_MAX_PIXELS = 100;

/**
 * Reads the camera into HUD state. Latitude and longitude are the ground point under the center of
 * the view, which is what a reader expects in every mode: in Columbus view a tilted camera sits
 * beyond the edge of the map, so its own position is not a place. When the center misses the
 * globe (space behind a 3D limb), the camera's own position is used. Elevation is the camera's
 * height above the ellipsoid.
 */
function readCamera(viewer: CesiumViewer): CameraState {
  const { camera, scene } = viewer;
  const ellipsoid = scene.globe.ellipsoid;
  const position = camera.positionCartographic;
  const center = camera.pickEllipsoid(
    new Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2),
    ellipsoid,
  );
  const ground = center ? ellipsoid.cartesianToCartographic(center) : undefined;
  const state: CameraState = {
    latitude: CesiumMath.toDegrees((ground ?? position).latitude),
    longitude: CesiumMath.toDegrees((ground ?? position).longitude),
    height: position.height,
    heading: CesiumMath.toDegrees(camera.heading),
  };
  const rect = camera.computeViewRectangle(ellipsoid);
  if (rect) {
    state.view = {
      west: CesiumMath.toDegrees(rect.west),
      south: CesiumMath.toDegrees(rect.south),
      east: CesiumMath.toDegrees(rect.east),
      north: CesiumMath.toDegrees(rect.north),
    };
  }
  state.scale = measureScale(viewer);
  return state;
}

/**
 * Measures a scale bar from two ground points {@link SCALE_MAX_PIXELS} apart across the center of
 * the view. The center, not the edge, is measured because the edge of a flat map is near a pole,
 * where the projection stretches distance. Returns undefined when the center misses the globe.
 */
function measureScale(viewer: CesiumViewer): CameraState['scale'] {
  const { camera, scene } = viewer;
  const ellipsoid = scene.globe.ellipsoid;
  const x = scene.canvas.clientWidth / 2 - SCALE_MAX_PIXELS / 2;
  const y = scene.canvas.clientHeight / 2;
  const left = camera.pickEllipsoid(new Cartesian2(x, y), ellipsoid);
  const right = camera.pickEllipsoid(new Cartesian2(x + SCALE_MAX_PIXELS, y), ellipsoid);
  if (!left || !right) return undefined;
  const geodesic = new EllipsoidGeodesic(
    ellipsoid.cartesianToCartographic(left),
    ellipsoid.cartesianToCartographic(right),
    ellipsoid,
  );
  return niceScale(geodesic.surfaceDistance, SCALE_MAX_PIXELS);
}

/** A change key: the HUD re-renders only when a displayed value changes. */
function stateKey(s: CameraState): string {
  const v = s.view;
  return [
    s.latitude.toFixed(4),
    s.longitude.toFixed(4),
    Math.round(s.height),
    Math.round(s.heading),
    v ? [v.west, v.south, v.east, v.north].map((n) => n.toFixed(1)).join(',') : '',
    s.scale?.label ?? '',
    s.scale?.pixels ?? '',
  ].join('|');
}

/**
 * Lives inside the Resium viewer: applies the theme to the scene, sets the home view, and
 * reports camera state after each render, only when a displayed value changed.
 */
function SceneBridge({
  onReady,
  onCamera,
}: {
  onReady: (viewer: CesiumViewer) => void;
  onCamera: (state: CameraState) => void;
}) {
  const { viewer } = useCesium();
  useEffect(() => {
    if (!viewer) return;
    styleScene(viewer);
    // One base layer per viewer instance: destroying a viewer destroys its layers.
    const baseLayer = createBaseLayer();
    viewer.imageryLayers.add(baseLayer, 0);
    viewer.camera.setView({
      destination: homeDestination(),
    });
    onReady(viewer);
    let last = '';
    const remove = viewer.scene.postRender.addEventListener(() => {
      const state = readCamera(viewer);
      const key = stateKey(state);
      if (key !== last) {
        last = key;
        onCamera(state);
      }
    });
    return () => {
      remove();
      if (!viewer.isDestroyed()) viewer.imageryLayers.remove(baseLayer, true);
    };
  }, [viewer, onReady, onCamera]);
  return null;
}

/** Props for {@link MapViewer}. */
export interface MapViewerProps {
  /** Extra overlays drawn above the map (e.g. the time HUD). */
  children?: ReactNode;
}

/**
 * The map engine: a Resium viewer with Cesium's own widgets removed, the bundled Natural Earth II
 * base layer, the 2D Map / 3D Globe / Split toggle, and the DOM HUD (compass, zoom, inset,
 * lat/lon/elevation readout, scale bar). Renders at device pixel ratio for sharp output.
 */
export function MapViewer({ children }: MapViewerProps) {
  const [webgl] = useState(supportsWebGL);
  const [viewer, setViewer] = useState<CesiumViewer>();
  const [camera, setCamera] = useState<CameraState>();
  const [mode, setMode] = useState<SceneModeKey>('3d');
  const insetTiles = useMemo(() => insetTileUrls(), []);

  const onSceneMode = useCallback(
    (next: SceneModeKey) => {
      setMode(next);
      if (viewer) applySceneMode(viewer.scene, next, 1);
    },
    [viewer],
  );

  const onResetNorth = useCallback(() => {
    if (!viewer) return;
    const { camera: cam } = viewer;
    cam.setView({
      destination: cam.position.clone(),
      orientation: { heading: 0, pitch: cam.pitch, roll: 0 },
    });
  }, [viewer]);

  const onZoom = useCallback(
    (direction: 1 | -1) => {
      if (!viewer) return;
      const amount = viewer.camera.positionCartographic.height * 0.4;
      if (direction === 1) viewer.camera.zoomIn(amount);
      else viewer.camera.zoomOut(amount);
    },
    [viewer],
  );

  const onHome = useCallback(() => {
    viewer?.camera.flyTo({
      destination: homeDestination(),
      duration: 1,
    });
  }, [viewer]);

  if (!webgl) {
    return (
      <div className={styles.region}>
        <p className={styles.fallback} role="alert">
          The map needs WebGL, which this browser has turned off or does not support.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.region} data-testid="map-viewer" data-scene-mode={mode}>
      <ResiumViewer
        className={styles.viewer}
        baseLayer={false}
        animation={false}
        timeline={false}
        baseLayerPicker={false}
        geocoder={false}
        homeButton={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
        vrButton={false}
        skyBox={false}
        useBrowserRecommendedResolution={false}
      >
        <SceneBridge onReady={setViewer} onCamera={setCamera} />
      </ResiumViewer>
      <MapHud
        mode={mode}
        camera={camera}
        insetTiles={insetTiles}
        onSceneMode={onSceneMode}
        onResetNorth={onResetNorth}
        onZoom={onZoom}
        onHome={onHome}
      />
      {children}
    </div>
  );
}
