import { useCallback, useEffect, useMemo } from 'react';
import type { ForesignalClient } from '../../api/client';
import type { ChangeStream } from '../../api/stream/ChangeStream';
import { useTheme } from '../../app/theme';
import { defaultEnabled, drawnLayers, enabledKinds } from '../../map/records/catalog';
import type { RecordHit } from '../../map/records/recordPicking';
import { useLayerCatalog } from '../../map/records/useLayerCatalog';
import { useOverlayStyle } from '../../map/style/useOverlayStyle';
import { MapViewer } from '../../map/Viewer';
import { appStore, useStoreKey, type AppState, type Store } from '../../state/store';
import { useCommittedViewport, viewportOf } from '../../state/viewport';
import styles from './Map.module.css';

/** Props for {@link MapView}. */
export interface MapViewProps {
  api: ForesignalClient | undefined;
  /** The live stream, narrowed to the drawn kinds in view while the map shows. */
  stream?: ChangeStream;
  /** The store the layers, selection, viewport and scene live in (012); the app's by default. */
  store?: Store<AppState>;
}

/**
 * The full-screen map: the 2D map and 3D globe filling the screen, with only the map's own
 * controls (mode, compass, zoom, legend, overview and coordinates). It draws the layers the person
 * has on, which are the Global dashboard's (the store's choice, or the catalog's defaults), less
 * the hidden sources, kept current by the live stream; a record clicked is the shared selection.
 */
export function MapView({ api, stream, store = appStore }: MapViewProps) {
  const theme = useTheme();
  const overlayStyle = useOverlayStyle(api, theme.name);
  const overlay = overlayStyle.status === 'ready' ? overlayStyle.overlay : undefined;
  const catalogState = useLayerCatalog(api, overlay?.model);
  const catalog = catalogState.status === 'ready' ? catalogState.catalog : undefined;
  const layerState = useStoreKey('layers', store);
  const enabled = useMemo(
    () => new Set(layerState.kinds ?? (catalog ? defaultEnabled(catalog) : [])),
    [layerState.kinds, catalog],
  );
  const hiddenSources = useMemo(
    () => new Set(layerState.hiddenSources),
    [layerState.hiddenSources],
  );
  const layers = useMemo(() => (catalog ? drawnLayers(catalog, enabled) : []), [catalog, enabled]);
  const legendScope = useMemo(
    () => (catalog ? enabledKinds(catalog, enabled, hiddenSources) : undefined),
    [catalog, enabled, hiddenSources],
  );
  const storeViewport = useMemo(() => viewportOf(store), [store]);
  const viewport = useCommittedViewport(storeViewport);
  useEffect(() => stream?.retain(), [stream]);
  useEffect(() => {
    stream?.setFilter({ kinds: layers, bbox: viewport?.bbox });
  }, [stream, layers, viewport]);
  const selection = useStoreKey('selection', store);
  const select = useCallback((hit: RecordHit | undefined) => store.set('selection', hit), [store]);
  return (
    <section className={styles.map} aria-label="Map" data-testid="full-map">
      <h1 className={styles.title}>Map</h1>
      <MapViewer
        api={api}
        overlayStyle={overlayStyle}
        recordLayers={layers}
        hiddenSources={hiddenSources}
        legendScope={legendScope}
        selected={selection}
        onSelect={select}
        stream={stream}
        store={store}
        viewport={storeViewport}
      />
    </section>
  );
}
