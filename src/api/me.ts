import { unwrap, type ForesignalClient } from './client';
import type { components } from './generated/schema';

/**
 * The calling principal as `getMe` (`GET /v1/me`) reports it: the `principal`, the signed-in
 * `user`, the token used, the effective `permissions` and `scopes`, `groups`,
 * `notificationPreferences` and `defaultTlp`. `permissions` is present only for a login session.
 */
export type Me = components['schemas']['Me'];

/**
 * A subscribable holder for the signed-in {@link Me}, or `null` when anonymous.
 *
 * It is loaded from `getMe` on startup (and whenever the session changes) while a session token is
 * present, and cleared to `null` when the session is cleared or a load fails.
 */
export interface PrincipalStore {
  /** The signed-in principal, or `null` when anonymous. */
  get(): Me | null;
  /** Calls `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /**
   * Fetches `getMe` and publishes the resulting {@link Me}, or `null` if the call fails (an invalid
   * or expired session reads as anonymous). Safe to call again (e.g. after the session changes).
   */
  load(client: ForesignalClient): Promise<void>;
  /** Drops the held principal to `null`. */
  clear(): void;
}

/** Creates an empty {@link PrincipalStore} (anonymous until {@link PrincipalStore.load}). */
export function createPrincipalStore(): PrincipalStore {
  let me: Me | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: Me | null) => {
    me = next;
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => me,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load(client) {
      const mine = ++generation;
      try {
        const next = await unwrap(client.GET('/v1/me'));
        if (mine === generation) publish(next);
      } catch {
        // An invalid/expired session (or a reachable backend that refuses it) reads as anonymous;
        // the 401 handler clears the session itself.
        if (mine === generation) publish(null);
      }
    },
    clear() {
      // Supersede any in-flight load so its result cannot revive the principal.
      generation++;
      publish(null);
    },
  };
}
