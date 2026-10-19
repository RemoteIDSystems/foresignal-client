import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Viewer as ResiumViewer, useCesium } from 'resium';
import {
  Cartesian2,
  EllipsoidGeodesic,
  EllipsoidTerrainProvider,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartographic,
  type Viewer as CesiumViewer,
} from 'cesium';
import { createBaseLayers, insetTileUrls } from './imagery';
import { MapHud, type CameraState, type GroundPoint } from './MapHud';
import { niceScale } from './readout';
import { DEFAULT_SCENE_MODE, SCENE_MODES, type SceneModeKey } from './sceneMode';
import { homeDestination, styleScene, supportsWebGL, switchSceneMode } from './view';
import styles from './Viewer.module.css';

/** How long a 2D/3D switch animates, in seconds. */
const MORPH_SECONDS = 1;

/** Widest scale bar, in CSS pixels. */
const SCALE_MAX_PIXELS = 100;

/**
 * Ground elevation at a point, in meters, from the globe's terrain. Undefined when the globe has no
 * terrain (Cesium's plain ellipsoid), because every point would read 0 m and that is not a
 * measurement. The client has no terrain source yet.
 */
function groundElevation(viewer: CesiumViewer, point: Cartographic): number | undefined {
  if (viewer.terrainProvider instanceof EllipsoidTerrainProvider) return undefined;
  return viewer.scene.globe.getHeight(point);
}

/** The ground point at a canvas position, or undefined where the position shows space. */
function groundAt(viewer: CesiumViewer, position: Cartesian2): Cartographic | undefined {
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const hit = viewer.camera.pickEllipsoid(position, ellipsoid);
  return hit ? ellipsoid.cartesianToCartographic(hit) : undefined;
}

/**
 * Reads the camera and pointer into HUD state.
 *
 * - `latitude`, `longitude` and `height` are the view: the ground point under the center of the
 *   canvas (or the camera's own position when the center shows space) and the camera height. A
 *   2D/3D switch keeps this place.
 * - `ground` is what the readout shows: the ground point under the mouse pointer and its terrain
 *   elevation; when the pointer is off the map or over space, the ground point at the view center.
 */
function readCamera(viewer: CesiumViewer, pointer: Cartesian2 | undefined): CameraState {
  const { camera, scene } = viewer;
  const position = camera.positionCartographic;
  const centerPixel = new Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
  const center = groundAt(viewer, centerPixel);
  const state: CameraState = {
    latitude: CesiumMath.toDegrees((center ?? position).latitude),
    longitude: CesiumMath.toDegrees((center ?? position).longitude),
    height: position.height,
    heading: CesiumMath.toDegrees(camera.heading),
  };
  const underPointer = pointer && groundAt(viewer, pointer);
  const point = underPointer ?? center;
  if (point) {
    const ground: GroundPoint = {
      latitude: CesiumMath.toDegrees(point.latitude),
      longitude: CesiumMath.toDegrees(point.longitude),
      source: underPointer ? 'pointer' : 'center',
    };
    const elevation = groundElevation(viewer, point);
    if (elevation !== undefined) ground.elevation = elevation;
    state.ground = ground;
  }
  const rect = camera.computeViewRectangle(scene.globe.ellipsoid);
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
  const g = s.ground;
  return [
    s.latitude.toFixed(4),
    s.longitude.toFixed(4),
    Math.round(s.height),
    Math.round(s.heading),
    v ? [v.west, v.south, v.east, v.north].map((n) => n.toFixed(1)).join(',') : '',
    s.scale?.label ?? '',
    s.scale?.pixels ?? '',
    g ? [g.latitude.toFixed(4), g.longitude.toFixed(4), g.elevation?.toFixed(0), g.source] : '',
  ].join('|');
}

/**
 * Lives inside the Resium viewer: applies the theme and day/night lighting, adds the basemap, sets
 * the home view, tracks the mouse pointer over the canvas, and reports camera state after each
 * render, only when a displayed value changed.
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
    // Base layers per viewer instance: destroying a viewer destroys its layers.
    const baseLayers = createBaseLayers();
    baseLayers.forEach((layer, index) => viewer.imageryLayers.add(layer, index));
    viewer.camera.setView({
      destination: homeDestination(),
    });
    onReady(viewer);
    let pointer: Cartesian2 | undefined;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: ScreenSpaceEventHandler.MotionEvent) => {
      pointer = Cartesian2.clone(movement.endPosition);
    }, ScreenSpaceEventType.MOUSE_MOVE);
    const onLeave = () => {
      pointer = undefined;
    };
    viewer.scene.canvas.addEventListener('pointerleave', onLeave);
    let last = '';
    const remove = viewer.scene.postRender.addEventListener(() => {
      const state = readCamera(viewer, pointer);
      const key = stateKey(state);
      if (key !== last) {
        last = key;
        onCamera(state);
      }
    });
    return () => {
      remove();
      handler.destroy();
      viewer.scene.canvas.removeEventListener('pointerleave', onLeave);
      if (!viewer.isDestroyed())
        baseLayers.forEach((layer) => viewer.imageryLayers.remove(layer, true));
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
 * The map engine: a Resium viewer with Cesium's own widgets removed, the self-hosted NASA
 * Blue Marble / Black Marble day/night basemap, the 2D Map / 3D Globe toggle (2D by default), and
 * the DOM HUD (compass, zoom, inset, pointer lat/lon/elevation readout, scale bar). Renders at
 * device pixel ratio for sharp output. The clock runs in real time so the terminator moves; 013's
 * time machine takes it over. Cesium's credits go to a detached element: they are shown on the
 * About page instead of over the map.
 */
export function MapViewer({ children }: MapViewerProps) {
  const [webgl] = useState(supportsWebGL);
  const [viewer, setViewer] = useState<CesiumViewer>();
  const [camera, setCamera] = useState<CameraState>();
  const [mode, setMode] = useState<SceneModeKey>(DEFAULT_SCENE_MODE);
  const insetTiles = useMemo(() => insetTileUrls(), []);
  const [creditContainer] = useState(() => document.createElement('div'));

  // The latest camera state, read when switching mode without re-creating the callback each frame.
  const cameraRef = useRef<CameraState>(undefined);
  const onCamera = useCallback((state: CameraState) => {
    cameraRef.current = state;
    setCamera(state);
  }, []);

  const onSceneMode = useCallback(
    (next: SceneModeKey) => {
      setMode(next);
      if (viewer) switchSceneMode(viewer, next, cameraRef.current, MORPH_SECONDS);
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
        sceneMode={SCENE_MODES[DEFAULT_SCENE_MODE]}
        useBrowserRecommendedResolution={false}
        shouldAnimate
        creditContainer={creditContainer}
      >
        <SceneBridge onReady={setViewer} onCamera={onCamera} />
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
