import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/** The caller's enabled-source view over the shared collection (`getMySources`). */
export type UserSourceView = components['schemas']['UserSourceView'];

/** One source in that view: its id, whether it is `enabled`, and optional label/color overrides. */
export type UserSourcePref = components['schemas']['UserSourcePref'];

/** The body to replace the caller's enabled-source view (`updateMySources`). */
export type UserSourceViewUpdate = components['schemas']['UserSourceViewUpdate'];

/** Reads the caller's per-user source view. */
export function getMySources(api: ForesignalClient, signal?: AbortSignal): Promise<UserSourceView> {
  return unwrap(api.GET('/v1/me/sources', { signal }));
}

/** Replaces the caller's per-user source view and returns the stored result. */
export function updateMySources(
  api: ForesignalClient,
  sources: UserSourcePref[],
): Promise<UserSourceView> {
  return unwrap(api.PUT('/v1/me/sources', { body: { sources } }));
}

/** The source ids the user has turned off, which the app hides from views, alerts and the map. */
export function disabledSourceIds(view: UserSourceView | null): ReadonlySet<string> {
  if (!view) return EMPTY;
  return new Set(view.sources.filter((source) => !source.enabled).map((source) => source.sourceId));
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * A subscribable holder for the signed-in user's {@link UserSourceView}, or `null` when unknown.
 * Loaded at sign-in; the map reads its disabled sources (via {@link useDisabledSources}) so a
 * user's visibility choices take effect on the layers.
 */
export interface UserSourcesStore {
  /** The current view, or `null` when unknown. */
  get(): UserSourceView | null;
  /** Calls `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Fetches `getMySources` and publishes the result, or `null` if the call fails. */
  load(api: ForesignalClient): Promise<void>;
  /** Publishes a view directly (e.g. the result of a successful save). */
  set(next: UserSourceView): void;
  /** Drops the held view to `null`. */
  clear(): void;
}

/** Creates an empty {@link UserSourcesStore} (null until {@link UserSourcesStore.load}). */
export function createUserSourcesStore(): UserSourcesStore {
  let view: UserSourceView | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: UserSourceView | null) => {
    view = next;
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load(api) {
      const mine = ++generation;
      try {
        const next = await getMySources(api);
        if (mine === generation) publish(next);
      } catch {
        if (mine === generation) publish(null);
      }
    },
    set(next) {
      generation++;
      publish(next);
    },
    clear() {
      generation++;
      publish(null);
    },
  };
}

/** The session's user-sources store, provided by the app shell; absent in isolated tests. */
export const UserSourcesContext = createContext<UserSourcesStore | undefined>(undefined);

const NO_STORE = () => () => {};
const NO_VIEW = () => null;

/** The signed-in user's source view, re-rendering when it changes; `null` without a provider. */
export function useUserSources(): UserSourceView | null {
  const store = useContext(UserSourcesContext);
  return useSyncExternalStore(store?.subscribe ?? NO_STORE, store?.get ?? NO_VIEW);
}

/**
 * The source ids the signed-in user has turned off, as a stable set. The map unions this into the
 * FILTERS tab's hidden sources, so a user's disabled sources vanish from the layers.
 */
export function useDisabledSources(): ReadonlySet<string> {
  const view = useUserSources();
  return useMemo(() => disabledSourceIds(view), [view]);
}
