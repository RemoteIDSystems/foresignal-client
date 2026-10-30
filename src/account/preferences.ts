import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/**
 * The calling user's preferences (`getMyPreferences`, `GET /v1/me/preferences`): `timezone` (IANA,
 * null = server default), `locale`, `theme`, notification defaults and a free-form `ui` object.
 */
export type UserPreferences = components['schemas']['UserPreferences'];

/** The notification defaults block of {@link UserPreferences}. */
export type NotificationDefaults = NonNullable<UserPreferences['notifications']>;

/**
 * The theme choices the contract carries (`x-extensible-enum`). `system` follows the OS; `light`
 * and `dark` select a theme. Rendered through `resolveTheme` into an actual {@link Theme}.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** The theme choices in the order the editor offers them. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/** Reads the calling user's preferences. */
export function getMyPreferences(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<UserPreferences> {
  return unwrap(api.GET('/v1/me/preferences', { signal }));
}

/** Replaces the calling user's preferences and returns the stored result. */
export function updateMyPreferences(
  api: ForesignalClient,
  body: UserPreferences,
): Promise<UserPreferences> {
  return unwrap(api.PUT('/v1/me/preferences', { body }));
}

/**
 * A subscribable holder for the signed-in user's {@link UserPreferences}, or `null` when they are
 * unknown (anonymous, not yet loaded, or a load that failed).
 *
 * The app root reads this to apply the chosen theme (through `resolveTheme`) and the chosen
 * timezone/locale (through the app clock), so a saved change applies across the whole app from one
 * place rather than only on the Account screen.
 */
export interface PreferencesStore {
  /** The current preferences, or `null` when unknown. */
  get(): UserPreferences | null;
  /** Calls `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Fetches `getMyPreferences` and publishes the result, or `null` if the call fails. */
  load(api: ForesignalClient): Promise<void>;
  /** Publishes preferences directly (e.g. the result of a successful save). */
  set(next: UserPreferences): void;
  /** Drops the held preferences to `null` (sign-out, or a lost session). */
  clear(): void;
}

/** Creates an empty {@link PreferencesStore} (null until {@link PreferencesStore.load}). */
export function createPreferencesStore(): PreferencesStore {
  let prefs: UserPreferences | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: UserPreferences | null) => {
    prefs = next;
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => prefs,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load(api) {
      const mine = ++generation;
      try {
        const next = await getMyPreferences(api);
        if (mine === generation) publish(next);
      } catch {
        // Anonymous, forbidden, or unreachable: the app falls back to its defaults.
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
