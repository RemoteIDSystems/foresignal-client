import { useState } from 'react';
import { Link } from 'react-router';
import type { ForesignalClient } from '../api/client';
import { utcText } from '../intel/analysisView';
import { useRead } from '../intel/useHypotheses';
import type { Part } from '../intel/useEvidence';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import analysis from '../views/analysis/Analysis.module.css';
import {
  addWatchlistItems,
  createView,
  createWatchlist,
  listWatchlistItems,
  type SavedView,
  type Watchlist,
  type WatchlistInput,
} from './savedApi';
import { parseItems, watchlistView, watchlistViewSlug } from './savedView';
import { ViewRecords } from './ViewRecords';
import styles from './Saved.module.css';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The identities a watchlist can hold, as the backend names them. */
const IDENTITIES: readonly WatchlistInput['identity'][] = [
  'icao24',
  'registration',
  'callsign',
  'mmsi',
  'imo',
  'entity',
  'custom',
];

/** Props for {@link WatchlistDetail}. */
interface WatchlistDetailProps {
  api: ForesignalClient | undefined;
  list: Watchlist;
  views: Part<SavedView[]>;
  onOpen: (ref: string) => void;
  onChanged: () => void;
}

/**
 * One watchlist: its items, Add items, and its entities' current state, which is the records of
 * the watchlist's saved view (an `inWatchlist` view, the backend matching). Without that view,
 * **Track current state** saves it.
 */
function WatchlistDetail({ api, list, views, onOpen, onChanged }: WatchlistDetailProps) {
  const [version, setVersion] = useState(0);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string>();
  const items = useRead(
    api,
    list.id,
    (client, id, signal) => listWatchlistItems(client, id, signal),
    version,
  );
  const view =
    views.status === 'ready'
      ? views.value.find((candidate) => candidate.slug === watchlistViewSlug(list.id))
      : undefined;
  const add = async () => {
    const parsed = parseItems(text);
    if (!api || !parsed.length) return;
    try {
      const result = await addWatchlistItems(api, list.id, parsed);
      setNote(
        `${result.added} added, ${result.updated} updated${result.invalid.length ? `, ${result.invalid.length} invalid` : ''}.`,
      );
      setText('');
      setVersion((current) => current + 1);
      onChanged();
    } catch (error) {
      setNote(`Not added: ${messageOf(error)}`);
    }
  };
  const track = async () => {
    if (!api) return;
    try {
      await createView(api, watchlistView(list));
      onChanged();
    } catch (error) {
      setNote(`Not tracked: ${messageOf(error)}`);
    }
  };
  return (
    <div className={styles.dialog}>
      <section aria-label={`${list.name} items`}>
        {items.status === 'loading' && <p className={analysis.muted}>Loading items…</p>}
        {items.status === 'error' && (
          <p className={analysis.muted}>The items did not load: {items.message}</p>
        )}
        {items.status === 'ready' &&
          (items.value.length ? (
            <div className={analysis.tableWrap}>
              <table className={analysis.table}>
                <thead>
                  <tr>
                    <th scope="col">Value</th>
                    <th scope="col">Label</th>
                    <th scope="col">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {items.value.map((item) => (
                    <tr key={item.value}>
                      <td>{item.value}</td>
                      <td>{item.label ?? '—'}</td>
                      <td>{utcText(item.addedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={analysis.muted}>No items yet.</p>
          ))}
      </section>
      <form
        className={styles.form}
        aria-label={`Add to ${list.name}`}
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label className={styles.field} style={{ flex: '1 1 240px' }}>
          Items, one per line (value, label)
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={!parseItems(text).length}>
          Add items
        </Button>
      </form>
      <section aria-label={`${list.name} current state`}>
        <h3 className={analysis.cardTitle}>Current state</h3>
        {view ? (
          <ViewRecords
            api={api}
            viewId={view.id}
            onOpen={onOpen}
            empty="None of its entities has a current record."
          />
        ) : (
          <Button type="button" onClick={() => void track()} disabled={views.status !== 'ready'}>
            Track current state
          </Button>
        )}
      </section>
      <p>
        <Link
          className={analysis.linkButton}
          to={`/alerts?new=watchlist&ref=${encodeURIComponent(list.id)}`}
        >
          Create alert for this watchlist
        </Link>
      </p>
      {note && <p className={analysis.muted}>{note}</p>}
    </div>
  );
}

/** Props for {@link WatchlistsTab}. */
export interface WatchlistsTabProps {
  api: ForesignalClient | undefined;
  watchlists: Part<Watchlist[]>;
  /** The saved views, to find each watchlist's own view. */
  views: Part<SavedView[]>;
  /** Opens a record by its object ref. */
  onOpen: (ref: string) => void;
  /** Called after a change, to read the lists again. */
  onChanged: () => void;
}

/**
 * The watchlists (031): name, identity and item count; opening one lists its items, adds items,
 * and shows its entities' current state. A new list takes a name and an identity.
 */
export function WatchlistsTab({ api, watchlists, views, onOpen, onChanged }: WatchlistsTabProps) {
  const [open, setOpen] = useState<string>();
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState<WatchlistInput['identity']>('icao24');
  const [note, setNote] = useState<string>();
  const create = async () => {
    if (!api || !name.trim()) return;
    try {
      const list = await createWatchlist(api, { name: name.trim(), identity });
      setNote(`Created “${list.name}”.`);
      setName('');
      setOpen(list.id);
      onChanged();
    } catch (error) {
      setNote(`Not created: ${messageOf(error)}`);
    }
  };
  const lists = watchlists.status === 'ready' ? watchlists.value : [];
  return (
    <div className={styles.dialog}>
      {watchlists.status === 'loading' && <p className={analysis.muted}>Loading watchlists…</p>}
      {watchlists.status === 'error' && (
        <p className={analysis.muted}>The watchlists did not load: {watchlists.message}</p>
      )}
      {watchlists.status === 'ready' && !lists.length && (
        <p className={analysis.muted}>No watchlists yet.</p>
      )}
      <ul className={styles.list} aria-label="Watchlists">
        {lists.map((list) => (
          <li key={list.id} className={styles.row} aria-label={list.name}>
            <div className={styles.rowHead}>
              <span className={styles.rowName}>{list.name}</span>
              <Badge tone="info">{list.identity}</Badge>
              <span className={styles.muted}>{list.itemCount} items</span>
              <Button
                type="button"
                variant="ghost"
                aria-expanded={open === list.id}
                onClick={() => setOpen(open === list.id ? undefined : list.id)}
              >
                {open === list.id ? 'Close' : 'Open'}
              </Button>
            </div>
            {open === list.id && (
              <WatchlistDetail
                api={api}
                list={list}
                views={views}
                onOpen={onOpen}
                onChanged={onChanged}
              />
            )}
          </li>
        ))}
      </ul>
      <form
        className={styles.form}
        aria-label="New watchlist"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label className={styles.field}>
          Name
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Identity
          <select
            className={analysis.select}
            value={identity}
            onChange={(event) => setIdentity(event.target.value as WatchlistInput['identity'])}
          >
            {IDENTITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          New watchlist
        </Button>
      </form>
      {note && <p className={analysis.muted}>{note}</p>}
    </div>
  );
}
