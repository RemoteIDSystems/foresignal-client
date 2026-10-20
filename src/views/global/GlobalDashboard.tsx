import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import type { ForesignalClient } from '../../api/client';
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
import { useCommittedViewport } from '../../state/viewport';
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
 * (010). The other panels are skeletons with placeholder data until their prompts.
 */
export function GlobalDashboard({ api }: { api?: ForesignalClient }) {
  const theme = useTheme();
  const overlayStyle = useOverlayStyle(api, theme.name);
  const overlay = overlayStyle.status === 'ready' ? overlayStyle.overlay : undefined;
  const catalogState = useLayerCatalog(api, overlay?.model);
  const catalog = catalogState.status === 'ready' ? catalogState.catalog : undefined;
  // The user's choice once they toggle; until then the default for the catalog.
  const [chosen, setChosen] = useState<ReadonlySet<string>>();
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
    [enabled],
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
    [enabled],
  );

  const productsState = useProducts(api);
  const productList = productsState.status === 'ready' ? productsState.products : NO_PRODUCTS;
  const entries = useMemo(() => productEntries(productList), [productList]);
  const [chosenProducts, setChosenProducts] = useState<ReadonlySet<string>>();
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
    [enabledProducts],
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

  const clear = useCallback(() => {
    setChosen(new Set());
    setChosenProducts(new Set());
  }, []);

  const [hiddenSources, setHiddenSources] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSource = useCallback((source: string) => {
    setHiddenSources((current) => {
      const next = new Set(current);
      if (!next.delete(source)) next.add(source);
      return next;
    });
  }, []);
  const showAllSources = useCallback(() => setHiddenSources(new Set()), []);

  const onLayerStatus = useCallback((id: string, status: RecordLayerStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  // Counts in view: the map commits its viewport when the camera rests; the summary follows it.
  const viewport = useCommittedViewport();
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
  const restoreKinds = useCallback(() => setChosen(undefined), []);
  const allOn = useCallback(() => setChosen(new Set(allKinds)), [allKinds]);
  // The selected record (010 picks it; 014's dossier shows it).
  const [selection, setSelection] = useState<RecordHit>();
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
          >
            <TimeHudPlaceholder />
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
