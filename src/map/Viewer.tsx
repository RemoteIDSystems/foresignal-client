import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Viewer as ResiumViewer, useCesium } from 'resium';
import {
  Cartesian2,
  EllipsoidGeodesic,
  Math as CesiumMath,
  SceneMode,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartographic,
  type Viewer as CesiumViewer,
} from 'cesium';
import type { ForesignalClient } from '../api/client';
import { useTheme } from '../app/theme';
import { createBaseLayers, insetTileUrls } from './imagery';
import { MapAttribution } from './style/attribution';
import { MapLegend } from './style/legend';
import { useOverlayStyle } from './style/useOverlayStyle';
import { createTerrainProvider, TerrainSampler } from './terrain';
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
 * The ground point at a canvas position, or undefined where the position shows space. In 3D it is
 * where the view ray meets the rendered terrain, so over raised relief the readout names the place
 * the user sees, not the sea-level point behind it; before terrain is drawn there, and in the flat
 * 2D map, it is where the ray meets the ellipsoid.
 */
function groundAt(viewer: CesiumViewer, position: Cartesian2): Cartographic | undefined {
  const { camera, scene } = viewer;
  const ellipsoid = scene.globe.ellipsoid;
  if (scene.mode === SceneMode.SCENE3D) {
    const ray = camera.getPickRay(position);
    const surface = ray && scene.globe.pick(ray, scene);
    if (surface) return ellipsoid.cartesianToCartographic(surface);
  }
  const hit = camera.pickEllipsoid(position, ellipsoid);
  return hit ? ellipsoid.cartesianToCartographic(hit) : undefined;
}

/**
 * Reads the camera and pointer into HUD state.
 *
 * - `latitude`, `longitude` and `height` are the view: the ground point under the center of the
 *   canvas (or the camera's own position when the center shows space) and the camera height. A
 *   2D/3D switch keeps this place.
 * - `ground` is what the readout shows: the ground point under the mouse pointer and its terrain
 *   elevation (from `sampler`, the most detailed terrain; undefined until it loads); when the
 *   pointer is off the map or over space, the ground point at the view center with no elevation.
 */
function readCamera(
  viewer: CesiumViewer,
  pointer: Cartesian2 | undefined,
  sampler: TerrainSampler | undefined,
): CameraState {
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
    // Elevation is read only under the pointer; with the pointer off the map it shows a dash.
    const elevation = underPointer ? sampler?.heightAt(underPointer) : undefined;
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
 * Lives inside the Resium viewer: applies the theme and day/night lighting, adds the basemap and
 * the self-hosted terrain, sets the home view, tracks the mouse pointer over the canvas, and
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
    // Base layers per viewer instance: destroying a viewer destroys its layers.
    const baseLayers = createBaseLayers();
    baseLayers.forEach((layer, index) => viewer.imageryLayers.add(layer, index));
    let active = true;
    let sampler: TerrainSampler | undefined;
    createTerrainProvider()
      .then((terrain) => {
        if (!active || viewer.isDestroyed()) return;
        viewer.terrainProvider = terrain;
        sampler = new TerrainSampler(terrain);
      })
      .catch((error: unknown) => {
        // The map still works on the plain ellipsoid; the readout then shows no elevation.
        console.error('Terrain failed to load', error);
      });
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
      const state = readCamera(viewer, pointer, sampler);
      const key = stateKey(state);
      if (key !== last) {
        last = key;
        onCamera(state);
      }
    });
    return () => {
      active = false;
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
  /** Backend client for the overlay style, legend and attribution; without it the map has none. */
  api?: ForesignalClient;
}

/**
 * The map engine: a Resium viewer with Cesium's own widgets removed, the self-hosted NASA
 * Blue Marble / Black Marble day/night basemap draped over self-hosted ETOPO terrain (raised in
 * 3D, flat in 2D), the 2D Map / 3D Globe toggle (2D by default), and
 * the DOM HUD (compass, zoom, inset, pointer lat/lon/elevation readout, scale bar). Renders at
 * device pixel ratio for sharp output. The clock runs in real time so the terminator moves; 013's
 * time machine takes it over. Cesium's credits go to a detached element: they are shown on the
 * About page instead of over the map. With an API client it loads the backend's overlay style for
 * the theme, offers its legend from the HUD, and shows the attributions the data licenses require.
 */
export function MapViewer({ children, api }: MapViewerProps) {
  const [webgl] = useState(supportsWebGL);
  const [viewer, setViewer] = useState<CesiumViewer>();
  const [camera, setCamera] = useState<CameraState>();
  const [mode, setMode] = useState<SceneModeKey>(DEFAULT_SCENE_MODE);
  const insetTiles = useMemo(() => insetTileUrls(), []);
  const [creditContainer] = useState(() => document.createElement('div'));
  const theme = useTheme();
  const overlayStyle = useOverlayStyle(api, theme.name);
  const [legendOpen, setLegendOpen] = useState(false);
  const onToggleLegend = useCallback(() => setLegendOpen((open) => !open), []);

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
        onToggleLegend={api ? onToggleLegend : undefined}
        legendOpen={legendOpen}
      />
      {legendOpen && (
        <MapLegend state={overlayStyle} api={api} onClose={() => setLegendOpen(false)} />
      )}
      <MapAttribution api={api} />
      {children}
    </div>
  );
}
