import { readStored, writeStored } from '../lib/storage';

/** The `localStorage` key holding the bearer token. */
export const TOKEN_STORAGE_KEY = 'foresignal.token';

/**
 * Holds the bearer token for API calls, persisted client-side.
 *
 * With no token the client relies on the backend's open reads; with one, every call sends
 * `Authorization: Bearer <token>`. Subscribers are told whenever the token changes, which suits
 * React's `useSyncExternalStore`.
 */
export interface TokenStore {
  /** The current token, or `null` when none is set. */
  get(): string | null;
  /** Sets the token (trimmed); a blank value clears it. */
  set(token: string): void;
  /** Removes the token. */
  clear(): void;
  /** Calls `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** Creates a token store backed by `localStorage` under {@link TOKEN_STORAGE_KEY}. */
export function createTokenStore(): TokenStore {
  let token = readStored(TOKEN_STORAGE_KEY);
  const listeners = new Set<() => void>();

  const update = (next: string | null) => {
    if (next === token) return;
    token = next;
    writeStored(TOKEN_STORAGE_KEY, next);
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => token,
    set: (value) => update(value.trim() || null),
    clear: () => update(null),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
