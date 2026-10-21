import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { components } from '../api/generated/schema';
import type { SceneModeKey } from '../map/sceneMode';
import type { RecordHit } from '../map/records/recordPicking';
import type { HistoryPlayback } from '../time/history';
import type { CommittedViewport } from './viewport';

/** What the user turned on and filtered in the layers rail. */
export interface LayersState {
  /** Kinds turned on, sorted; undefined until the user chooses (the catalog's defaults apply). */
  kinds?: readonly string[];
  /** Product layer keys turned on, sorted; undefined until the user chooses. */
  products?: readonly string[];
  /** Sources whose records are hidden (the FILTERS tab), sorted. */
  hiddenSources: readonly string[];
  /** The saved view drawn in place of the kinds' layers (031), by id; undefined for none. */
  view?: string;
}

/** The tabs of the saved-state dialog (031). */
export type SavedTab = 'views' | 'places' | 'watchlists';

/** The time cursor: following live data, or pinned at an instant (013's time machine). */
export type TimeCursor = { mode: 'live' } | { mode: 'asOf'; asOf: string };

/**
 * A history playback on the map (013): the frames loaded, the step shown, and whether it is
 * stepping on by itself. While one is held, the map draws its step in place of the tiles.
 */
export interface PlaybackState {
  history: HistoryPlayback;
  index: number;
  playing: boolean;
}

/** The inbox badge (018 fills it). */
export interface InboxBadge {
  unread: number;
}

/**
 * What the live stream has said about one kind: the last change seq and how many changes, live
 * updates and resyncs arrived. A component showing a kind subscribes to its `layer:<kind>` key and
 * re-renders when that kind changes, and only then.
 */
export interface LayerLive {
  lastSeq?: number;
  changes: number;
  live: number;
  resyncs: number;
  /** When the last change or update arrived (epoch ms). */
  at?: number;
}

/** The app's shared state, by key. `layer:<kind>` keys hold each kind's live state. */
export interface AppState {
  /** The map's mode: the 2D map or the 3D globe. */
  sceneMode: SceneModeKey;
  /** The map's committed viewport; undefined until it first commits one. */
  viewport: CommittedViewport | undefined;
  /** Enabled layers and their filters. */
  layers: LayersState;
  /** The selected record, if any (010 picks it; 014 shows its dossier). */
  selection: RecordHit | undefined;
  /** Live, or pinned at an instant. */
  time: TimeCursor;
  /** The history playback shown on the map, if any (013). */
  playback: PlaybackState | undefined;
  /** The inbox badge. */
  inbox: InboxBadge;
  /** Bumped whenever the workspace context changes, for the views that cache against it. */
  workspaceContextVersion: number;
  /** A place the map is asked to move to (017's search and find bar); the map clears it. */
  locate: LocateRequest | undefined;
  /** The workspace this client's context is bound to (025), if any. */
  workspace: ActiveWorkspace | undefined;
  /** Whether the Workspaces dialog is open (025). */
  workspacesOpen: boolean;
  /** The saved-state dialog's open tab (031); undefined while it is closed. */
  savedOpen: SavedTab | undefined;
  /** Whether the keyboard shortcuts overlay is open (036). */
  shortcutsOpen: boolean;
  /** Whether the first-run welcome is shown (036). */
  welcomeOpen: boolean;
  /** The dashboard panels the user closed, by id, sorted; kept in a workspace's layout (025). */
  closedPanels: readonly string[];
  [key: `layer:${string}`]: LayerLive | undefined;
}

/** The workspace a client is bound to: its id, name, role, and the context version last seen. */
export interface ActiveWorkspace {
  id: string;
  name: string;
  /** The caller's role, as the backend gives it. */
  role?: string;
  /** The context as of `contextVersion`, as the backend last returned it. */
  context: components['schemas']['WorkspaceContext'];
  contextVersion: number;
  /** Why the last change was not saved, until one is. */
  error?: string;
}

/** A request to move the map to a place (017). */
export interface LocateRequest {
  longitude: number;
  latitude: number;
  /** The camera height to show it from, in meters; the current height (at most 8,000 km) if absent. */
  height?: number;
  /** When it was asked (`Date.now()`), so asking for the same place again moves the map again. */
  at: number;
}

/** The state a store starts with. */
export const INITIAL_STATE: AppState = {
  sceneMode: '2d',
  viewport: undefined,
  layers: { hiddenSources: [] },
  selection: undefined,
  time: { mode: 'live' },
  playback: undefined,
  inbox: { unread: 0 },
  workspaceContextVersion: 0,
  locate: undefined,
  workspace: undefined,
  workspacesOpen: false,
  savedOpen: undefined,
  shortcutsOpen: false,
  welcomeOpen: false,
  closedPanels: [],
};

/**
 * A keyed reactive store: each key has its own listeners, so a component subscribed to `viewport`
 * is not told about `layers`. Writes are reconciled ({@link reconcile}): a value equal to the one
 * held changes nothing and tells no one, and an object that changed in part keeps its unchanged
 * parts' identities, so a fast stream of deltas does not make unrelated subscribers reconcile.
 */
export interface Store<S extends object> {
  /** The value held under `key`. */
  get<K extends keyof S>(key: K): S[K];
  /** Replaces the value under `key`; nothing happens if the new value equals the old. */
  set<K extends keyof S>(key: K, value: S[K]): void;
  /** Sets the value under `key` from the one held. */
  update<K extends keyof S>(key: K, next: (current: S[K]) => S[K]): void;
  /** Merges fields into the object under `key`. */
  merge<K extends keyof S>(key: K, patch: Partial<NonNullable<S[K]>>): void;
  /** Runs `writes` and tells each affected key's listeners once, after all of them. */
  batch(writes: () => void): void;
  /** Calls `listener` after each change to `key`; returns an unsubscribe function. */
  subscribe<K extends keyof S>(key: K, listener: () => void): () => void;
  /** The keys that hold a value now (for `layer:<kind>` keys). */
  keys(): (keyof S)[];
}

/** Creates a {@link Store} holding `initial`. */
export function createStore<S extends object>(initial: S): Store<S> {
  const values = new Map<keyof S, unknown>(Object.entries(initial) as [keyof S, unknown][]);
  const listeners = new Map<keyof S, Set<() => void>>();
  let batching = 0;
  const dirty = new Set<keyof S>();

  const notify = (key: keyof S) => {
    if (batching > 0) {
      dirty.add(key);
      return;
    }
    for (const listener of [...(listeners.get(key) ?? [])]) listener();
  };

  const store: Store<S> = {
    get: <K extends keyof S>(key: K) => values.get(key) as S[K],
    set(key, value) {
      const current = values.get(key);
      const next = reconcile(current, value);
      if (next === current) return;
      if (next === undefined) values.delete(key);
      else values.set(key, next);
      notify(key);
    },
    update(key, next) {
      store.set(key, next(store.get(key)));
    },
    merge(key, patch) {
      const current = store.get(key);
      store.set(key, { ...(current ?? {}), ...patch } as S[typeof key]);
    },
    batch(writes) {
      batching++;
      try {
        writes();
      } finally {
        batching--;
        if (batching === 0) {
          const keys = [...dirty];
          dirty.clear();
          for (const key of keys) notify(key);
        }
      }
    },
    subscribe(key, listener) {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(key);
      };
    },
    keys: () => [...values.keys()],
  };
  return store;
}

/**
 * The value to hold when `next` is written over `current`: `current` itself when the two are
 * equal (plain objects and arrays compared by content, at any depth), else `next` with every part
 * equal to `current`'s replaced by `current`'s, so unchanged parts keep their identity. Class
 * instances (other than plain objects and arrays) compare by identity.
 */
export function reconcile<T>(current: unknown, next: T): T {
  if (Object.is(current, next)) return current as T;
  if (Array.isArray(current) && Array.isArray(next)) {
    const items = next.map((item, i) => reconcile(current[i], item));
    const same = items.length === current.length && items.every((item, i) => item === current[i]);
    return (same ? current : items) as T;
  }
  if (isPlain(current) && isPlain(next)) {
    const keys = Object.keys(next);
    const out: Record<string, unknown> = {};
    let same = keys.length === Object.keys(current).length;
    for (const key of keys) {
      out[key] = reconcile(current[key], next[key]);
      if (out[key] !== current[key] || !(key in current)) same = false;
    }
    return (same ? current : out) as T;
  }
  return next;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/** The app's one store: the map and panels read from it, the live stream writes into it. */
export const appStore = createStore<AppState>(INITIAL_STATE);

/**
 * Subscribes a component to one key of the store; it re-renders when that key's value changes,
 * and for no other key.
 */
export function useStoreKey<K extends keyof AppState>(
  key: K,
  store: Store<AppState> = appStore,
): AppState[K] {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, listener),
    [store, key],
  );
  const read = useCallback(() => store.get(key), [store, key]);
  return useSyncExternalStore(subscribe, read);
}

/**
 * Subscribes a component to several keys; it re-renders when any of them changes. The object
 * returned is the same until one of the values does.
 */
export function useStoreKeys<K extends keyof AppState>(
  keys: readonly K[],
  store: Store<AppState> = appStore,
): Pick<AppState, K> {
  // The keys as one value, so a new array of the same keys is the same subscription.
  const id = keys.join('\n');
  const reader = useMemo(() => keysReader(store, id.split('\n') as K[]), [store, id]);
  return useSyncExternalStore(reader.subscribe, reader.snapshot);
}

/**
 * Subscribes to several keys of a store together, and reads them as one object that stays the same
 * until one of the values changes (as `useSyncExternalStore` needs).
 */
export function keysReader<S extends object, K extends keyof S>(
  store: Store<S>,
  keys: readonly K[],
) {
  let held: { values: unknown[]; result: Pick<S, K> } | undefined;
  return {
    subscribe(listener: () => void): () => void {
      const stops = keys.map((key) => store.subscribe(key, listener));
      return () => stops.forEach((stop) => stop());
    },
    snapshot(): Pick<S, K> {
      const values = keys.map((key) => store.get(key));
      if (held && values.every((value, i) => value === held!.values[i])) return held.result;
      const result = Object.fromEntries(keys.map((key, i) => [key, values[i]])) as Pick<S, K>;
      held = { values, result };
      return result;
    },
  };
}
