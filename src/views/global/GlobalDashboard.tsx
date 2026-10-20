import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ForesignalClient } from '../../api/client';
import { RASTER_FRAME_KIND, type ChangeStream } from '../../api/stream/ChangeStream';
import { DashboardLayout, type DockPanel } from '../../app/DashboardLayout';
import { useTheme } from '../../app/theme';
import {
  defaultEnabled,
  drawnLayers,
  enabledKinds,
  withViewCounts,
} from '../../map/records/catalog';
import type { RecordLayerStatus } from '../../map/records/recordLayers';
import { allKeys, defaultProductLayers, productEntries } from '../../map/products/productCatalog';
import type { Product } from '../../map/products/productApi';
import type { ProductLayerStatus } from '../../map/products/productLayers';
import { useProducts } from '../../map/products/useProducts';
import { useLayerCatalog } from '../../map/records/useLayerCatalog';
import { useOverlayStyle } from '../../map/style/useOverlayStyle';
import { MapViewer } from '../../map/Viewer';
import type { RecordHit } from '../../map/records/recordPicking';
import { stressModeOn } from '../../map/stress/stressMode';
import { useViewCounts } from '../../state/contextSummary';
import { useCommittedViewport, viewportOf } from '../../state/viewport';
import { appStore, useStoreKey, type AppState, type Store } from '../../state/store';
import {
  ActivityTimelinePanel,
  InsightsPanel,
  RecentImageryPanel,
  RelatedEntitiesPanel,
} from './BottomPanels';
import { LayersRail } from './LayersRail';
import {
  RecordLayersContext,
  type ProductLayersValue,
  type RecordLayersValue,
} from './recordLayersContext';
import { TimeHudPlaceholder } from './TimeHudPlaceholder';
import { SelectedEntityPanel } from './SelectedEntityPanel';

/** The stress harness (010), loaded only in development builds; production builds leave it out. */
const StressHarness = import.meta.env.DEV
  ? lazy(() =>
      import('../../map/stress/StressHarness').then((module) => ({
        default: module.StressHarness,
      })),
    )
  : undefined;

/** No products, before the catalog loads. */
const NO_PRODUCTS: readonly Product[] = [];

/** The Global Dashboard's panels and the slots they dock into. */
const PANELS: readonly DockPanel[] = [
  { id: 'layers', title: 'Layers', slot: 'left', render: () => <LayersRail /> },
  {
    id: 'selected-entity',
    title: 'Selected Entity',
    slot: 'right',
    render: (close) => <SelectedEntityPanel onClose={close} />,
  },
  {
    id: 'recent-imagery',
    title: 'Recent Imagery',
    slot: 'bottom',
    grow: 1.12,
    render: (close) => <RecentImageryPanel onClose={close} />,
  },
  {
    id: 'activity',
    title: 'Activity Timeline',
    slot: 'bottom',
    grow: 1.06,
    render: () => <ActivityTimelinePanel />,
  },
  {
    id: 'insights',
    title: 'Analytics & Insights',
    slot: 'bottom',
    grow: 1.03,
    render: (close) => <InsightsPanel onClose={close} />,
  },
  {
    id: 'related',
    title: 'Related Entities',
    slot: 'bottom',
    grow: 0.94,
    render: () => <RelatedEntitiesPanel />,
  },
];

/**
 * The Global Intelligence Dashboard (primary mockup): layers rail, map, selected-entity panel and
 * the bottom row of imagery, activity, insights and related entities. The rail and the map share
 * the overlay style, the layer catalog, the enabled kinds (at first, the kinds of the categories the
 * mock shows checked) and the sources the FILTERS tab hides. The rail's counts are the records in
 * the map's committed viewport, from the backend's viewport summary (008). The backend's raster
 * products and wind fields (009) are listed under their categories and drawn under the records; the
 * curated weather products are on at first, as the mock's Weather row is checked. A record clicked
 * on the map is the page's selection (010), for 014's dossier. In a development build, `?stress`
 * adds the stress harness, which can turn on every kind in the catalog at once and measure the map
 * (010). The page holds the live stream open (011), narrowed to the drawn kinds (and product frames)
 * in the committed view, so the map stays current; the time HUD's badge shows its state. The enabled
 * layers, hidden sources, selection and viewport are the store's (012), so they outlast the page. The other
 * panels are skeletons with placeholder data until their prompts.
 */
export function GlobalDashboard({
  api,
  stream,
  store = appStore,
}: {
  api?: ForesignalClient;
  /** The live stream (011): held open while the page shows, narrowed to its layers and view. */
  stream?: ChangeStream;
  /** The store the page's layers, selection, viewport and scene live in (012); the app's. */
  store?: Store<AppState>;
}) {
  const storeViewport = useMemo(() => viewportOf(store), [store]);
  const theme = useTheme();
  const overlayStyle = useOverlayStyle(api, theme.name);
  const overlay = overlayStyle.status === 'ready' ? overlayStyle.overlay : undefined;
  const catalogState = useLayerCatalog(api, overlay?.model);
  const catalog = catalogState.status === 'ready' ? catalogState.catalog : undefined;
  // Layers and their filters live in the store (012): the user's choice once they toggle; until
  // then the catalog's default.
  const layerState = useStoreKey('layers', store);
  const chosen = useMemo(
    () => (layerState.kinds ? new Set(layerState.kinds) : undefined),
    [layerState.kinds],
  );
  const setChosen = useCallback(
    (kinds: ReadonlySet<string> | undefined) =>
      store.merge('layers', { kinds: kinds && [...kinds].sort() }),
    [store],
  );
  const enabled = useMemo(
    () => chosen ?? new Set(catalog ? defaultEnabled(catalog) : []),
    [chosen, catalog],
  );
  const [statuses, setStatuses] = useState<Record<string, RecordLayerStatus>>({});

  const toggle = useCallback(
    (kind: string) => {
      const next = new Set(enabled);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      setChosen(next);
    },
    [enabled, setChosen],
  );
  const setKinds = useCallback(
    (kinds: readonly string[], on: boolean) => {
      const next = new Set(enabled);
      for (const kind of kinds) {
        if (on) next.add(kind);
        else next.delete(kind);
      }
      setChosen(next);
    },
    [enabled, setChosen],
  );

  const productsState = useProducts(api);
  const productList = productsState.status === 'ready' ? productsState.products : NO_PRODUCTS;
  const entries = useMemo(() => productEntries(productList), [productList]);
  const chosenProducts = useMemo(
    () => (layerState.products ? new Set(layerState.products) : undefined),
    [layerState.products],
  );
  const setChosenProducts = useCallback(
    (keys: ReadonlySet<string> | undefined) =>
      store.merge('layers', { products: keys && [...keys].sort() }),
    [store],
  );
  const enabledProducts = useMemo(
    () => chosenProducts ?? new Set(defaultProductLayers(entries)),
    [chosenProducts, entries],
  );
  const setProductKeys = useCallback(
    (keys: readonly string[], on: boolean) => {
      const next = new Set(enabledProducts);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      setChosenProducts(next);
    },
    [enabledProducts, setChosenProducts],
  );
  const [productStatuses, setProductStatuses] = useState<Record<string, ProductLayerStatus>>({});
  const onProductStatus = useCallback((key: string, status: ProductLayerStatus) => {
    setProductStatuses((current) => ({ ...current, [key]: status }));
  }, []);
  // Drawn bottom first in the rail's order, so the order does not depend on the order of clicks.
  const productLayers = useMemo(
    () =>
      entries
        .filter((entry) => entry.available)
        .flatMap((entry) => allKeys(entry).filter((key) => enabledProducts.has(key))),
    [entries, enabledProducts],
  );
  const products = useMemo<ProductLayersValue>(
    () => ({
      entries,
      enabled: enabledProducts,
      setKeys: setProductKeys,
      statuses: productStatuses,
    }),
    [entries, enabledProducts, setProductKeys, productStatuses],
  );

  const clear = useCallback(() => store.merge('layers', { kinds: [], products: [] }), [store]);

  const hiddenSources = useMemo(
    () => new Set(layerState.hiddenSources),
    [layerState.hiddenSources],
  );
  const toggleSource = useCallback(
    (source: string) =>
      store.update('layers', (current) => {
        const next = new Set(current.hiddenSources);
        if (!next.delete(source)) next.add(source);
        return { ...current, hiddenSources: [...next].sort() };
      }),
    [store],
  );
  const showAllSources = useCallback(() => store.merge('layers', { hiddenSources: [] }), [store]);

  const onLayerStatus = useCallback((id: string, status: RecordLayerStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  // Counts in view: the map commits its viewport when the camera rests; the summary follows it.
  const viewport = useCommittedViewport(storeViewport);
  const viewCounts = useViewCounts(api, viewport);
  const railCatalog = useMemo(
    () =>
      catalogState.status === 'ready'
        ? { ...catalogState, catalog: withViewCounts(catalogState.catalog, viewCounts?.counts) }
        : catalogState,
    [catalogState, viewCounts],
  );

  // The development stress harness (010) draws every enabled kind, records or not.
  const [stress] = useState(stressModeOn);
  const recordLayers = useMemo(() => {
    if (!catalog) return [];
    if (stress) return catalog.kinds.filter((entry) => enabled.has(entry.id)).map((e) => e.id);
    return drawnLayers(catalog, enabled);
  }, [catalog, enabled, stress]);
  const allKinds = useMemo(() => catalog?.kinds.map((entry) => entry.id) ?? [], [catalog]);
  const restoreKinds = useCallback(() => setChosen(undefined), [setChosen]);
  const allOn = useCallback(() => setChosen(new Set(allKinds)), [allKinds, setChosen]);
  // The live stream follows what the map draws: the drawn kinds (and product frames) in the view.
  useEffect(() => stream?.retain(), [stream]);
  useEffect(() => {
    stream?.setFilter({
      kinds: productLayers.length > 0 ? [...recordLayers, RASTER_FRAME_KIND] : recordLayers,
      bbox: viewport?.bbox,
    });
  }, [stream, recordLayers, productLayers, viewport]);
  // The selected record (010 picks it; 014's dossier shows it), in the store (012).
  const selection = useStoreKey('selection', store);
  const setSelection = useCallback(
    (hit: RecordHit | undefined) => store.set('selection', hit),
    [store],
  );
  const legendScope = useMemo(
    () => (catalog ? enabledKinds(catalog, enabled, hiddenSources) : undefined),
    [catalog, enabled, hiddenSources],
  );
  const value = useMemo<RecordLayersValue>(
    () => ({
      catalog: railCatalog,
      enabled,
      toggle,
      setKinds,
      clear,
      hiddenSources,
      toggleSource,
      showAllSources,
      statuses,
      products,
      selection,
      sprite: overlay?.sprite,
      api,
    }),
    [
      railCatalog,
      enabled,
      toggle,
      setKinds,
      clear,
      hiddenSources,
      toggleSource,
      showAllSources,
      statuses,
      products,
      selection,
      overlay,
      api,
    ],
  );

  return (
    <RecordLayersContext.Provider value={value}>
      <DashboardLayout
        map={
          <MapViewer
            api={api}
            overlayStyle={overlayStyle}
            recordLayers={recordLayers}
            hiddenSources={hiddenSources}
            legendScope={legendScope}
            legendEmptyNote={
              enabled.size > 0 ? 'The layers that are on have no records right now.' : undefined
            }
            onLayerStatus={onLayerStatus}
            products={productList}
            productLayers={productLayers}
            onProductStatus={onProductStatus}
            selected={selection}
            onSelect={setSelection}
            stream={stream}
            store={store}
            viewport={storeViewport}
          >
            <TimeHudPlaceholder stream={stream} />
            {stress && StressHarness && (
              <Suspense fallback={null}>
                <StressHarness
                  kinds={allKinds}
                  drawn={recordLayers}
                  onAll={allOn}
                  onRestore={restoreKinds}
                />
              </Suspense>
            )}
          </MapViewer>
        }
        panels={PANELS}
      />
    </RecordLayersContext.Provider>
  );
}
