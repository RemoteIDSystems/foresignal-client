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
  EllipsoidGeodesic,
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
import { viewportStore, type ViewportStore } from '../state/viewport';
import type { RecordLayerStatus } from './records/recordLayers';
import { RecordMarker } from './records/RecordMarker';
import { hitKey } from './records/mapPointer';
import type { RecordHit } from './records/recordPicking';
import { createTerrainProvider, TerrainSampler } from './terrain';
import { MapHud, type CameraState, type GroundPoint, type MapHudProps } from './MapHud';
import { niceScale } from './readout';
import { DEFAULT_SCENE_MODE, SCENE_MODES, type SceneModeKey } from './sceneMode';
import {
  homeDestination,
  styleScene,
  supportsWebGL,
  switchSceneMode,
  visibleRectangle,
} from './view';
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
 * device pixel ratio for sharp output. The clock runs in real time so the terminator moves; 013's
 * time machine takes it over. Cesium's credits go to a detached element: they are shown on the
 * About page instead of over the map. With an API client it loads the backend's overlay style for
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
 * tiles a change touches are fetched again and new product frames are swapped in as announced.
 */
export function MapViewer({
  children,
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
}: MapViewerProps) {
  const [webgl] = useState(supportsWebGL);
  const [viewer, setViewer] = useState<CesiumViewer>();
  const [cameraStore] = useState(createCameraStore);
  const [mode, setMode] = useState<SceneModeKey>(DEFAULT_SCENE_MODE);
  const insetTiles = useMemo(() => insetTileUrls(), []);
  const [creditContainer] = useState(() => document.createElement('div'));
  const theme = useTheme();
  const ownStyle = useOverlayStyle(sharedStyle ? undefined : api, theme.name);
  const overlayStyle = sharedStyle ?? ownStyle;
  const overlay = overlayStyle.status === 'ready' ? overlayStyle.overlay : undefined;
  // Open by default, as in the Conflict mockup.
  const [legendOpen, setLegendOpen] = useState(true);
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
        sceneMode={SCENE_MODES[DEFAULT_SCENE_MODE]}
        useBrowserRecommendedResolution={false}
        shouldAnimate
        creditContainer={creditContainer}
      >
        <SceneBridge onReady={setViewer} onCamera={onCamera} />
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
          />
        )}
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
      />
      {legend}
      <MapAttribution api={api} extra={productAttributions} />
      {children}
    </div>
  );
}
