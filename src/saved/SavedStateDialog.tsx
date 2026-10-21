import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { ForesignalClient } from '../api/client';
import { utcText } from '../intel/analysisView';
import { useRead } from '../intel/useHypotheses';
import type { Part } from '../intel/useEvidence';
import { useStoreKey, type AppState, type SavedTab, type Store } from '../state/store';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';
import analysis from '../views/analysis/Analysis.module.css';
import { flyToPlaceOnMap, openViewOnMap } from './openSaved';
import { PlacesTab } from './PlacesTab';
import { listPlaces, listViews, listWatchlists, type SavedView } from './savedApi';
import { SAVED_ENTRIES } from './savedEntries';
import { ViewRecords } from './ViewRecords';
import { WatchlistsTab } from './WatchlistsTab';
import styles from './Saved.module.css';

/** Props for {@link SavedStateDialog}. */
export interface SavedStateDialogProps {
  api: ForesignalClient | undefined;
  store: Store<AppState>;
  /** The bearer token: places and watchlists always need one. */
  token: string | null;
  /** Opens an object by ref (a record of a view). */
  onOpen: (ref: string) => void;
}

/** What a list says it needs without a token. */
const NO_TOKEN = { status: 'error', message: 'This needs an access token (Settings).' } as const;

/** The saved views: each with what it holds, Open on the map, and its current records. */
function ViewsTab({
  api,
  views,
  onOpenView,
  onOpen,
}: {
  api: ForesignalClient | undefined;
  views: Part<SavedView[]>;
  onOpenView: (view: SavedView) => void;
  onOpen: (ref: string) => void;
}) {
  const [shown, setShown] = useState<string>();
  if (views.status === 'loading') return <p className={analysis.muted}>Loading views…</p>;
  if (views.status === 'error')
    return <p className={analysis.muted}>The views did not load: {views.message}</p>;
  return (
    <div className={styles.dialog}>
      {!views.value.length && (
        <p className={analysis.muted}>
          No saved views yet. Save the map&rsquo;s layers from the Global rail (Save view).
        </p>
      )}
      <ul className={styles.list} aria-label="Saved views">
        {views.value.map((view) => (
          <li key={view.id} className={styles.row} aria-label={view.name}>
            <div className={styles.rowHead}>
              <span className={styles.rowName}>{view.name}</span>
              <span className={styles.muted}>
                v{view.version} · {utcText(view.updatedAt)}
              </span>
              <Button type="button" variant="primary" onClick={() => onOpenView(view)}>
                Open
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-expanded={shown === view.id}
                onClick={() => setShown(shown === view.id ? undefined : view.id)}
              >
                Records
              </Button>
            </div>
            <div className={styles.rowHead}>
              {(view.kinds?.length ? view.kinds : ['every kind']).map((kind) => (
                <Badge key={kind} tone="info" uppercase={false}>
                  {kind}
                </Badge>
              ))}
              {view.sources?.length ? (
                <span className={styles.muted}>{view.sources.length} sources</span>
              ) : null}
              {view.conditions?.length ? (
                <span className={styles.muted}>{view.conditions.length} conditions</span>
              ) : null}
              {view.bbox ? (
                <span className={styles.muted}>
                  {view.bbox.map((value) => value.toFixed(2)).join(', ')}
                </span>
              ) : null}
            </div>
            {shown === view.id && <ViewRecords api={api} viewId={view.id} onOpen={onOpen} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The saved-state dialog (031), opened from the Global rail, the Workbench's WORKSPACE section and
 * the analysis TOOLS: **Saved Views** (open one on the map, list its records), **Places** (fly to,
 * weather, add) and **Watchlists** (items, add, current state). Places and watchlists need a token.
 */
export function SavedStateDialog({ api, store, token, onOpen }: SavedStateDialogProps) {
  const tab = useStoreKey('savedOpen', store);
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const open = tab !== undefined;
  const key = open ? `${token ?? ''}` : undefined;
  const views = useRead(
    api,
    key === undefined ? undefined : `views#${key}`,
    (client, _key, signal) => listViews(client, signal),
    version,
  );
  const places = useRead(
    api,
    open && token ? `places#${token}` : undefined,
    (client, _key, signal) => listPlaces(client, signal),
    version,
  );
  const watchlists = useRead(
    api,
    open && token ? `watchlists#${token}` : undefined,
    (client, _key, signal) => listWatchlists(client, signal),
    version,
  );
  const close = () => store.set('savedOpen', undefined);
  const changed = () => setVersion((current) => current + 1);
  const viewport = store.get('viewport');
  const center: [number, number] | undefined = viewport && [
    (viewport.bbox[0] + viewport.bbox[2]) / 2,
    (viewport.bbox[1] + viewport.bbox[3]) / 2,
  ];
  const openRecord = (ref: string) => {
    close();
    onOpen(ref);
  };
  return (
    <Modal open={open} title="Saved" onClose={close} size="default">
      <div className={styles.dialog} data-testid="saved-dialog">
        <Tabs
          items={SAVED_ENTRIES.map((entry) => ({ key: entry.tab, label: entry.label }))}
          value={tab ?? 'views'}
          onChange={(next: SavedTab) => store.set('savedOpen', next)}
          label="Saved state"
        />
        {tab === 'views' && (
          <ViewsTab
            api={api}
            views={views}
            onOpenView={(view) => {
              openViewOnMap(store, view);
              void navigate('/global');
            }}
            onOpen={openRecord}
          />
        )}
        {tab === 'places' && (
          <PlacesTab
            api={api}
            places={token ? places : NO_TOKEN}
            center={center}
            onFly={(place) => {
              if (flyToPlaceOnMap(store, place)) void navigate('/global');
            }}
            onChanged={changed}
          />
        )}
        {tab === 'watchlists' && (
          <WatchlistsTab
            api={api}
            watchlists={token ? watchlists : NO_TOKEN}
            views={views}
            onOpen={openRecord}
            onChanged={changed}
          />
        )}
      </div>
    </Modal>
  );
}
