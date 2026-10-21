import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ForesignalClient } from '../../api/client';
import type { ChangeStream } from '../../api/stream/ChangeStream';
import { useTheme } from '../../app/theme';
import { focusOf, memberCategories } from '../../intel/analysisView';
import { categoryOf, KIND_CATEGORIES, type CategoryId } from '../../lib/kindCategories';
import type { Geometry } from '../../map/areaOutline';
import { drawnLayers, enabledKinds } from '../../map/records/catalog';
import { useLayerCatalog } from '../../map/records/useLayerCatalog';
import { useOverlayStyle } from '../../map/style/useOverlayStyle';
import { MapViewer } from '../../map/Viewer';
import { createStore, INITIAL_STATE, type AppState } from '../../state/store';
import { viewportOf } from '../../state/viewport';
import styles from './Analysis.module.css';

/**
 * The Map tab (019): a map of its own, not the Global dashboard's, flown to the situation's or
 * investigation's area, which is outlined; the record layers of its members' kinds are drawn, and
 * the toolbar's chips (one per category among them, as the mock's Conflicts / Military /
 * Infrastructure / … row) turn each category on and off. The legend lists what is drawn.
 */
export function AnalysisMap({
  api,
  stream,
  areas,
  bbox,
  kinds,
  toolbar,
}: {
  api: ForesignalClient | undefined;
  stream: ChangeStream | undefined;
  areas: readonly (Geometry | null | undefined)[];
  bbox: readonly number[] | null | undefined;
  /** The members' record kinds. */
  kinds: readonly string[];
  /** More controls for the toolbar's end (the time range). */
  toolbar?: ReactNode;
}) {
  const theme = useTheme();
  // The tab's own store: its camera, scene mode and viewport leave the Global dashboard's alone.
  const [store] = useState(() => createStore<AppState>(INITIAL_STATE));
  const viewport = useMemo(() => viewportOf(store), [store]);
  const overlayStyle = useOverlayStyle(api, theme.name);
  const overlay = overlayStyle.status === 'ready' ? overlayStyle.overlay : undefined;
  const catalogState = useLayerCatalog(api, overlay?.model);
  const catalog = catalogState.status === 'ready' ? catalogState.catalog : undefined;
  const categories = useMemo(() => memberCategories(kinds), [kinds]);
  const [off, setOff] = useState<ReadonlySet<CategoryId>>(new Set());
  const enabled = useMemo(
    () => new Set(kinds.filter((kind) => !off.has(categoryOf(kind)))),
    [kinds, off],
  );
  const recordLayers = useMemo(
    () => (catalog ? drawnLayers(catalog, enabled) : []),
    [catalog, enabled],
  );
  const legendScope = useMemo(
    () => (catalog ? enabledKinds(catalog, enabled) : undefined),
    [catalog, enabled],
  );
  const focus = focusOf(bbox);
  useEffect(() => {
    if (focus) store.set('locate', { ...focus, at: Date.now() });
    // Flown once per area: a refresh with the same box leaves the camera where the user put it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, focus?.longitude, focus?.latitude, focus?.height]);
  const toggle = (id: CategoryId) =>
    setOff((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className={styles.mapPane} data-testid="analysis-map">
      <div className={styles.mapToolbar} role="group" aria-label="Layers">
        <span className={styles.muted}>Layers</span>
        {categories.length === 0 && <span className={styles.muted}>No member layers</span>}
        {categories.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.chip}
            aria-pressed={!off.has(id)}
            onClick={() => toggle(id)}
          >
            {KIND_CATEGORIES.find((category) => category.id === id)?.label ?? id}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {toolbar}
      </div>
      <div
        className={styles.mapCanvas}
        data-area={focus ? 'true' : 'false'}
        data-layers={recordLayers.join(' ')}
      >
        <MapViewer
          legendInitiallyOpen
          api={api}
          overlayStyle={overlayStyle}
          recordLayers={recordLayers}
          legendScope={legendScope}
          legendEmptyNote="The member layers have no records on the map right now."
          viewport={viewport}
          store={store}
          stream={stream}
          areas={areas}
        />
      </div>
    </div>
  );
}
