import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Viewer as ResiumViewer, useCesium } from 'resium';
import {
  Cartesian2,
  type Cartesian3,
  EllipsoidGeodesic,
  JulianDate,
  Rectangle,
  Math as CesiumMath,
  SceneMode,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartographic,
  type Viewer as CesiumViewer,
} from 'cesium';
import type { ForesignalClient } from '../api/client';
import type { ChangeStream } from '../api/stream/ChangeStream';
import { useTheme } from '../app/theme';
import { createBaseLayers, insetTileUrls } from './imagery';
import { MapAttribution } from './style/attribution';
import { MapLegend } from './style/legend';
import type { LegendScope } from './style/legendModel';
import { useOverlayStyle, type OverlayStyleState } from './style/useOverlayStyle';
import { RecordLayersBridge } from './records/RecordLayersBridge';
import { ProductLayersBridge } from './products/ProductLayersBridge';
import { ProductLegends } from './products/ProductLegends';
import { parseProductLayerKey, type ProductLayerStatus } from './products/productLayers';
import type { Product } from './products/productApi';
import type { Attribution } from './style/attributionModel';
import { ViewportTracker } from './ViewportTracker';
import { viewportStore, type CommittedViewport, type ViewportStore } from '../state/viewport';
import type { RecordLayerStatus } from './records/recordLayers';
import { RecordMarker } from './records/RecordMarker';
import { TrailBridge } from './records/TrailBridge';
import { focusOn, locateTo } from './focus';
import { motionSeconds } from '../lib/motion';
import { AreaOutlines } from './AreaOutlines';
import type { Geometry } from './areaOutline';
import { threeDViewOf } from '../objects/threeD';
import type { RecordFeature } from './records/decodeTile';
import { frameFeature } from '../time/history';
import type { Trail } from '../time/trail';
import { hitKey } from './records/mapPointer';
import type { RecordHit } from './records/recordPicking';
import type { LiveAreaSource } from './records/liveChanges';
import { createTerrainProvider, TerrainSampler } from './terrain';
import { MapHud, type CameraState, type GroundPoint, type MapHudProps } from './MapHud';
import { niceScale } from './readout';
import { SCENE_MODES, type SceneModeKey } from './sceneMode';
import { appStore, useStoreKey, type AppState, type Store, type TimeCursor } from '../state/store';
import {
  homeDestination,
  sharpestDistanceOf,
  styleScene,
  supportsWebGL,
  switchSceneMode,
  visibleRectangle,
  zoomInAmount,
} from './view';
import styles from './Viewer.module.css';

/**
 * Sets the scene's clock to an instant (RFC 3339), stopped, or with undefined to now, running in
 * real time: the day/night terminator follows it.
 */
function setSceneTime(viewer: CesiumViewer, asOf: string | undefined): void {
  const { clock } = viewer;
  clock.currentTime = asOf !== undefined ? JulianDate.fromIso8601(asOf) : JulianDate.now();
  clock.shouldAnimate = asOf === undefined;
}

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
  const view = visibleRectangle(viewer);
  if (view) state.view = view;
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
 * Where a new map opens: the area of the viewport last committed, so a map built again (the page
 * left and come back to) shows what it showed; the home view when there is none, or when it was
 * the whole world (the globe seen from far away, which the home view frames better).
 */
function startDestination(start: CommittedViewport | undefined): Cartesian3 | Rectangle {
  if (!start) return homeDestination();
  const [west, south, east, north] = start.bbox;
  if (west <= -180 && east >= 180 && south <= -90 && north >= 90) return homeDestination();
  return Rectangle.fromDegrees(west, south, east, north);
}

/**
 * Lives inside the Resium viewer: applies the theme and day/night lighting, adds the basemap and
 * the self-hosted terrain, opens on the last committed view (from the store, 012) or the home view, tracks the mouse pointer over the canvas, and
 * reports camera state after each render, only when a displayed value changed.
 */
function SceneBridge({
  onReady,
  onCamera,
  start,
}: {
  onReady: (viewer: CesiumViewer) => void;
  onCamera: (state: CameraState) => void;
  /** The view to open on: the viewport last committed, else the home view. */
  start?: CommittedViewport;
}) {
  const { viewer } = useCesium();
  // Read once, when the viewer is set up; a later commit is where the camera already is.
  const startRef = useRef(start);
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
    viewer.camera.setView({ destination: startDestination(startRef.current) });
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
      // Mid-morph the camera has no heading (Cesium returns undefined); keep the last reading.
      if (viewer.scene.mode === SceneMode.MORPHING) return;
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

/** The latest camera state, held outside React state so that only the HUD re-renders as it moves. */
interface CameraStore {
  get(): CameraState | undefined;
  set(state: CameraState): void;
  subscribe(listener: () => void): () => void;
}

/** A {@link CameraStore}. */
function createCameraStore(): CameraStore {
  let current: CameraState | undefined;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (state) => {
      current = state;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The HUD, reading the camera from its store: the camera changes every frame while the map moves,
 * and only the HUD shows it, so the rest of the map (the legend of a full catalog of kinds above
 * all) does not re-render with it.
 */
function LiveHud({ store, ...props }: Omit<MapHudProps, 'camera'> & { store: CameraStore }) {
  const camera = useSyncExternalStore(store.subscribe, store.get);
  return <MapHud {...props} camera={camera} />;
}

/** Props for {@link MapViewer}. */
export interface MapViewerProps {
  /** Extra overlays drawn above the map (e.g. the time HUD). */
  children?: ReactNode;
  /** Drawn over the HUD's global-view inset (018's activity heat). */
  insetOverlay?: ReactNode;
  /** Whether the legend starts open (the analysis map's, as in the Conflict mock); closed otherwise. */
  legendInitiallyOpen?: boolean;
  /**
   * Keeps the camera no closer than where the basemap is still sharp ({@link sharpestDistanceOf}):
   * the wheel, gestures, the zoom buttons and a requested place all stop there. For a map that
   * draws no detail of its own below that (the analysis Map tab).
   */
  sharpBasemap?: boolean;
  /** Backend client for the overlay style, legend and attribution; without it the map has none. */
  api?: ForesignalClient;
  /**
   * The overlay style, when the page loads it to share with other panels (the layer rail); the
   * viewer loads it itself otherwise.
   */
  overlayStyle?: OverlayStyleState;
  /** Record layers to draw, by id (`listTileLayers`). */
  recordLayers?: readonly string[];
  /** Sources whose records are hidden (the FILTERS tab). */
  hiddenSources?: ReadonlySet<string>;
  /** The kinds those layers draw; the legend shows only these. */
  legendScope?: LegendScope;
  /** What the scoped legend says when nothing is on the map. */
  legendEmptyNote?: string;
  /** Told when a record layer's status changes (what it draws, whether it failed). */
  onLayerStatus?: (id: string, status: RecordLayerStatus) => void;
  /** Where the map commits its viewport once the camera rests; the app-wide store by default. */
  viewport?: ViewportStore;
  /** The product catalog (`listProducts`), for the product layers. */
  products?: readonly Product[];
  /** Product layers to draw, by key (`productLayerKey`), bottom first. */
  productLayers?: readonly string[];
  /**
   * The selected record, when the page holds the selection (for 014's dossier); the viewer holds
   * it itself otherwise.
   */
  selected?: RecordHit;
  /** Told when a record is clicked (undefined for a click on nothing, or Escape). */
  onSelect?: (hit: RecordHit | undefined) => void;
  /** Told when a product layer's status changes. */
  onProductStatus?: (key: string, status: ProductLayerStatus) => void;
  /** The live stream, which keeps the records and product frames on the map current (011). */
  stream?: ChangeStream;
  /** A saved view's own stream, which keeps its layer current (031). */
  liveAreas?: LiveAreaSource;
  /**
   * The scene mode, when the screen keeps its own (the Satellites screen opens on the 3D globe);
   * otherwise the store's `sceneMode`, shared by the screens that do not.
   */
  sceneMode?: SceneModeKey;
  /** Told of a scene-mode change, with {@link MapViewerProps.sceneMode}. */
  onSceneModeChange?: (mode: SceneModeKey) => void;
  /** The store holding the scene mode (012); the app's by default. */
  store?: Store<AppState>;
  /** Areas outlined over the map, such as a situation's footprint (019). */
  areas?: readonly (Geometry | null | undefined)[];
  /**
   * Layers drawn inside the viewer, where Resium's `useCesium` reaches it (027's constellation);
   * `children` are drawn over the map, outside it.
   */
  scene?: ReactNode;
}

/** No record layers. */
const NO_LAYERS: readonly string[] = [];
/** No hidden sources. */
const NO_SOURCES: ReadonlySet<string> = new Set();
/** No products. */
const NO_PRODUCTS: readonly Product[] = [];

/**
 * The map engine: a Resium viewer with Cesium's own widgets removed, the self-hosted NASA
 * Blue Marble / Black Marble day/night basemap draped over self-hosted ETOPO terrain (raised in
 * 3D, flat in 2D), the 2D Map / 3D Globe toggle (2D by default), and
 * the DOM HUD (compass, zoom, inset, pointer lat/lon/elevation readout, scale bar). Renders at
 * device pixel ratio for sharp output. The clock runs in real time so the terminator moves, and
 * stands at the time machine's instant while the map is pinned (013). Cesium's credits go to a
 * detached element: they are shown on the About page instead of over the map. With an API client it loads the backend's overlay style for
 * the theme, draws the enabled record layers from their vector tiles with it, shows the legend for
 * what is on the map (open by default, toggled from the HUD), and the attributions the data licenses
 * require. Backend raster products and wind (009) are drawn under the records: rasters as imagery
 * layers over the basemap, with their legends (and loop controls) at the top of the legend and their
 * attributions with the rest. `data-record-features` on the region is the number of records drawn
 * one by one, `data-record-cells` the number of hexagon cells drawn for layers below their
 * aggregation zoom, and `data-product-layers` the product layers drawn. Records are picked on the
 * CPU from the drawn tiles (010): hovering one shows its callout and a pointer cursor, clicking one
 * selects it, marked as the Global mock marks the selected entity, and clicking nothing or pressing
 * Escape clears it; `data-hovered` and `data-selected` name them. With the live stream (011), the
 * tiles a change touches are fetched again and new product frames are swapped in as announced. The
 * scene mode is the store's `sceneMode` (012), unless the screen keeps its own (`sceneMode`): the
 * toggle writes it and any change to it morphs the map; a new map opens in that mode, over the viewport last committed to the store. The store's
 * `time` pins the records at an instant (013: `data-time` names it, or `live`), its `playback`
 * draws a history step in place of the tiles (`data-playback`), and the selected record shows its
 * trail up to the cursor (`data-trail`, the positions drawn). With `sharpBasemap` the camera
 * stops where the basemap would start to blur.
 */
export function MapViewer({
  children,
  insetOverlay,
  legendInitiallyOpen = false,
  sharpBasemap = false,
  api,
  overlayStyle: sharedStyle,
  recordLayers = NO_LAYERS,
  hiddenSources = NO_SOURCES,
  legendScope,
  legendEmptyNote,
  onLayerStatus,
  viewport = viewportStore,
  products = NO_PRODUCTS,
  productLayers = NO_LAYERS,
  onProductStatus,
  selected: controlledSelection,
  onSelect,
  stream,
  liveAreas,
  store = appStore,
  areas,
  scene,
  sceneMode: ownMode,
  onSceneModeChange,
}: MapViewerProps) {
  const [webgl] = useState(supportsWebGL);
  const [viewer, setViewer] = useState<CesiumViewer>();
  const [cameraStore] = useState(createCameraStore);
  // The mode lives in the store (012), so whatever selects an item can switch the map (014).
  const storeMode = useStoreKey('sceneMode', store);
  const mode = ownMode ?? storeMode;
  // The mode the viewer was created in; later changes morph it.
  const [initialMode] = useState(mode);
  // The time machine (013): pinned at an instant, or playing history, from the store.
  const time = useStoreKey('time', store);
  const playback = useStoreKey('playback', store);
  const asOf = time.mode === 'asOf' ? time.asOf : undefined;
  const frame = useMemo(
    () =>
      playback
        ? playback.history
            .stateAt(playback.index)
            .map(frameFeature)
            .filter((feature): feature is RecordFeature => feature !== undefined)
        : undefined,
    [playback],
  );
  const [trail, setTrail] = useState<Trail>();
  // During a playback the trail covers it to its end, rather than being read again at each step.
  const trailTime = useMemo<TimeCursor>(
    () =>
      playback
        ? { mode: 'asOf', asOf: playback.history.timeAt(playback.history.length - 1) }
        : time,
    [playback, time],
  );
  // The view it opens on, likewise from the store.
  const [startView] = useState(() => viewport.get());
  const insetTiles = useMemo(() => insetTileUrls(), []);
  const [creditContainer] = useState(() => document.createElement('div'));
  const theme = useTheme();
  const ownStyle = useOverlayStyle(sharedStyle ? undefined : api, theme.name);
  const overlayStyle = sharedStyle ?? ownStyle;
  const overlay = overlayStyle.status === 'ready' ? overlayStyle.overlay : undefined;
  // Closed unless asked for: the Global, Satellites and RF mocks show none; the Conflict mock's
  // analysis map does.
  const [legendOpen, setLegendOpen] = useState(legendInitiallyOpen);
  const [layerStatus, setLayerStatus] = useState<Record<string, RecordLayerStatus>>({});
  const statusListener = useRef(onLayerStatus);
  useEffect(() => {
    statusListener.current = onLayerStatus;
  }, [onLayerStatus]);
  const onStatus = useCallback((id: string, status: RecordLayerStatus) => {
    setLayerStatus((current) => ({ ...current, [id]: status }));
    statusListener.current?.(id, status);
  }, []);
  const drawnRecords = recordLayers.reduce((sum, id) => sum + (layerStatus[id]?.features ?? 0), 0);
  const drawnCells = recordLayers.reduce((sum, id) => sum + (layerStatus[id]?.cells ?? 0), 0);
  const onToggleLegend = useCallback(() => setLegendOpen((open) => !open), []);

  // Hover and selection (010): picked from the drawn tiles by the record layers' pointer.
  const [hovered, setHovered] = useState<RecordHit>();
  const [ownSelection, setOwnSelection] = useState<RecordHit>();
  const selectionListener = useRef(onSelect);
  useEffect(() => {
    selectionListener.current = onSelect;
  }, [onSelect]);
  const select = useCallback((hit: RecordHit | undefined) => {
    setOwnSelection(hit);
    selectionListener.current?.(hit);
  }, []);
  const selection = controlledSelection ?? ownSelection;
  // A record whose layer is turned off is no longer on the map to be marked.
  const shownSelection =
    selection && recordLayers.includes(selection.id.layer) ? selection : undefined;
  const shownHover =
    hovered &&
    recordLayers.includes(hovered.id.layer) &&
    !(shownSelection && hitKey(shownSelection) === hitKey(hovered))
      ? hovered
      : undefined;
  useEffect(() => {
    if (!shownSelection) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') select(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shownSelection, select]);

  const [productStatus, setProductStatus] = useState<Record<string, ProductLayerStatus>>({});
  const productListener = useRef(onProductStatus);
  useEffect(() => {
    productListener.current = onProductStatus;
  }, [onProductStatus]);
  const onProduct = useCallback((key: string, status: ProductLayerStatus) => {
    setProductStatus((current) => ({ ...current, [key]: status }));
    productListener.current?.(key, status);
  }, []);
  // Loops play only while asked; a layer turned off stops its loop.
  const [loopChoice, setLoopChoice] = useState<ReadonlySet<string>>(() => new Set());
  const looping = useMemo(
    () => new Set([...loopChoice].filter((key) => productLayers.includes(key))),
    [loopChoice, productLayers],
  );
  const onToggleLoop = useCallback((key: string) => {
    setLoopChoice((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  const productAttributions = useMemo(() => {
    const ids = new Set(productLayers.map((key) => parseProductLayerKey(key).productId));
    return products
      .filter((product) => ids.has(product.id) && product.attribution)
      .map((product) => product.attribution as Attribution);
  }, [products, productLayers]);
  const drawnProducts = productLayers.filter((key) => productStatus[key]?.state === 'ready');

  // The latest camera state, read when switching mode without re-creating the callback each frame.
  const cameraRef = useRef<CameraState>(undefined);
  const onCamera = useCallback(
    (state: CameraState) => {
      cameraRef.current = state;
      cameraStore.set(state);
    },
    [cameraStore],
  );

  // The scene's clock is the time cursor's (013): pinned, the day/night terminator stands where it
  // was at that instant; live, it runs in real time again.
  useEffect(() => {
    if (viewer) setSceneTime(viewer, asOf);
  }, [viewer, asOf]);

  const onSceneMode = useCallback(
    (next: SceneModeKey) =>
      ownMode !== undefined ? onSceneModeChange?.(next) : store.set('sceneMode', next),
    [ownMode, onSceneModeChange, store],
  );

  // Contextual 3D (014): a newly selected item with a 3D view switches the map to the globe and
  // flies to it; any other is brought into view on the 2D map. The selection the map opens with
  // (restored from the store) does not move it.
  const selectionKey = selection ? hitKey(selection) : undefined;
  const latestSelection = useRef(selection);
  useEffect(() => {
    latestSelection.current = selection;
  }, [selection]);
  const [openingSelection] = useState(selectionKey);
  const focused = useRef(openingSelection);
  useEffect(() => {
    const hit = latestSelection.current;
    if (!hit) {
      focused.current = undefined;
      return;
    }
    if (!viewer || selectionKey === focused.current) return;
    focused.current = selectionKey;
    // A counted cell is not an item; an object with no position has nowhere to go.
    if (hit.type === 'cell' || !Number.isFinite(hit.longitude) || !Number.isFinite(hit.latitude)) {
      return;
    }
    return focusOn(viewer, hit, threeDViewOf(hit.id.kind) !== undefined, onSceneMode);
  }, [viewer, selectionKey, onSceneMode]);
  // A place asked for by search or the find bar (017): the map moves there and clears the request,
  // including one made before the map opened (a search from another screen).
  const locate = useStoreKey('locate', store);
  useEffect(() => {
    if (!viewer || !locate) return;
    locateTo(
      viewer,
      sharpBasemap && locate.height !== undefined
        ? { ...locate, height: Math.max(locate.height, sharpestDistanceOf(viewer)) }
        : locate,
    );
    store.set('locate', undefined);
  }, [viewer, locate, store, sharpBasemap]);
  // The closest the wheel and gestures may come, kept to the canvas's size and the scene's mode.
  useEffect(() => {
    if (!viewer || !sharpBasemap) return;
    const controller = viewer.scene.screenSpaceCameraController;
    const initial = controller.minimumZoomDistance;
    const remove = viewer.scene.preRender.addEventListener(() => {
      if (viewer.scene.mode === SceneMode.MORPHING) return;
      controller.minimumZoomDistance = sharpestDistanceOf(viewer);
    });
    return () => {
      remove();
      if (!viewer.isDestroyed()) controller.minimumZoomDistance = initial;
    };
  }, [viewer, sharpBasemap]);
  // The store's mode, whoever set it, is the scene's: a change morphs the map, keeping its place.
  useEffect(() => {
    if (viewer) switchSceneMode(viewer, mode, cameraRef.current, motionSeconds(MORPH_SECONDS));
  }, [viewer, mode]);

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
      const { camera, scene } = viewer;
      const amount = camera.positionCartographic.height * 0.4;
      // Cesium's own minimum holds the wheel and gestures only, so the button keeps to it here.
      const distance =
        scene.mode === SceneMode.SCENE2D
          ? camera.getMagnitude()
          : camera.positionCartographic.height;
      const minimum = scene.screenSpaceCameraController.minimumZoomDistance;
      if (direction === 1) camera.zoomIn(zoomInAmount(amount, distance, minimum));
      else viewer.camera.zoomOut(amount);
    },
    [viewer],
  );

  const onHome = useCallback(() => {
    viewer?.camera.flyTo({
      destination: homeDestination(),
      duration: motionSeconds(1),
    });
  }, [viewer]);

  const onCloseLegend = useCallback(() => setLegendOpen(false), []);
  const emptyNote =
    productLayers.length > 0 && !legendEmptyNote ? 'No record kinds on.' : legendEmptyNote;
  // Built again only when what it shows changes: the map re-renders on hover and status changes,
  // and a legend of a full catalog of kinds is costly to render for nothing.
  const legend = useMemo(
    () =>
      legendOpen && (
        <MapLegend
          state={overlayStyle}
          api={api}
          scope={legendScope}
          emptyNote={emptyNote}
          onClose={onCloseLegend}
          products={
            <ProductLegends
              api={api}
              products={products}
              layers={productLayers}
              statuses={productStatus}
              looping={looping}
              onToggleLoop={onToggleLoop}
            />
          }
        />
      ),
    [
      legendOpen,
      overlayStyle,
      api,
      legendScope,
      emptyNote,
      onCloseLegend,
      products,
      productLayers,
      productStatus,
      looping,
      onToggleLoop,
    ],
  );

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
    <div
      className={styles.region}
      data-testid="map-viewer"
      data-scene-mode={mode}
      data-record-features={drawnRecords}
      data-record-cells={drawnCells}
      data-product-layers={drawnProducts.join(' ')}
      data-hovered={shownHover ? hitKey(shownHover) : undefined}
      data-selected={shownSelection ? hitKey(shownSelection) : undefined}
      data-time={asOf ?? 'live'}
      data-playback={playback ? `${playback.index}/${playback.history.length}` : undefined}
      data-trail={trail ? trail.lines.reduce((sum, line) => sum + line.length, 0) : undefined}
      style={hovered ? { cursor: 'pointer' } : undefined}
    >
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
        sceneMode={SCENE_MODES[initialMode]}
        useBrowserRecommendedResolution={false}
        shouldAnimate
        creditContainer={creditContainer}
      >
        <SceneBridge onReady={setViewer} onCamera={onCamera} start={startView} />
        <ViewportTracker store={viewport} />
        {api && (
          <ProductLayersBridge
            api={api}
            products={products}
            layers={productLayers}
            looping={looping}
            viewport={viewport}
            onStatus={onProduct}
            stream={stream}
          />
        )}
        {api && (
          <RecordLayersBridge
            api={api}
            overlay={overlay}
            layers={recordLayers}
            hiddenSources={hiddenSources}
            onStatus={onStatus}
            onHover={setHovered}
            onSelect={select}
            stream={stream}
            liveAreas={liveAreas}
            asOf={asOf}
            frame={frame}
          />
        )}
        {areas && areas.length > 0 && (
          <AreaOutlines areas={areas} color={theme.tokens.color.accent} />
        )}
        {api && (
          <TrailBridge
            api={api}
            selected={shownSelection}
            time={trailTime}
            color={theme.tokens.color.accent}
            onTrail={setTrail}
          />
        )}
        {scene}
      </ResiumViewer>
      {viewer && shownSelection && (
        <RecordMarker viewer={viewer} hit={shownSelection} variant="selected" />
      )}
      {viewer && shownHover && <RecordMarker viewer={viewer} hit={shownHover} variant="hover" />}
      <LiveHud
        store={cameraStore}
        mode={mode}
        insetTiles={insetTiles}
        onSceneMode={onSceneMode}
        onResetNorth={onResetNorth}
        onZoom={onZoom}
        onHome={onHome}
        onToggleLegend={api ? onToggleLegend : undefined}
        legendOpen={legendOpen}
        insetOverlay={insetOverlay}
      />
      {legend}
      <MapAttribution api={api} extra={productAttributions} />
      {children}
    </div>
  );
}
