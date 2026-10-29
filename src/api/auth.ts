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

/** The `localStorage` key holding the signed-in session credential. */
export const SESSION_STORAGE_KEY = 'foresignal.session';

/**
 * The bearer prefix a login **session** token carries (`getMe`, R2-003 sign-in), as opposed to a
 * pasted API token (`fsr_`/`fsa_`). The two are stored under different keys and never conflated.
 */
export const SESSION_TOKEN_PREFIX = 'fss_';

/**
 * A signed-in session: its `fss_` bearer and, when the login reported them, its expiry bounds.
 *
 * `expiresAt`/`idleExpiresAt` come from the login `SessionToken` (consumed in R2-003); they are
 * carried here so the app can show and honor them, and are absent on a session rehydrated from a
 * store written before they were known.
 */
export interface SessionCredential {
  /** The `fss_` session bearer sent as `Authorization: Bearer <token>`. */
  token: string;
  /** Absolute expiry (`SessionToken.expiresAt`); `null`/absent when open-ended. */
  expiresAt?: string | null;
  /** Idle expiry (`SessionToken.idleExpiresAt`); `null`/absent when none. */
  idleExpiresAt?: string | null;
}

/**
 * Holds the signed-in {@link SessionCredential}, persisted client-side under
 * {@link SESSION_STORAGE_KEY}, separately from the pasted API token. Subscribers are told whenever
 * it changes, which suits React's `useSyncExternalStore`.
 */
export interface SessionStore {
  /** The current session, or `null` when signed out. */
  get(): SessionCredential | null;
  /** Signs in with the given credential. */
  set(credential: SessionCredential): void;
  /** Signs out, dropping the app to anonymous open reads. */
  clear(): void;
  /** Calls `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** Reads and parses the stored session credential, or `null` when absent or malformed. */
function readSession(): SessionCredential | null {
  const raw = readStored(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as SessionCredential).token === 'string'
    ) {
      return parsed as SessionCredential;
    }
  } catch {
    // Malformed value: treated as signed out.
  }
  return null;
}

/** Creates a session store backed by `localStorage` under {@link SESSION_STORAGE_KEY}. */
export function createSessionStore(): SessionStore {
  let session = readSession();
  const listeners = new Set<() => void>();

  const update = (next: SessionCredential | null) => {
    session = next;
    writeStored(SESSION_STORAGE_KEY, next === null ? null : JSON.stringify(next));
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => session,
    set: (credential) => update(credential),
    clear: () => update(null),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
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
