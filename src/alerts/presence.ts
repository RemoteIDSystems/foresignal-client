import type { ForesignalClient } from '../api/client';
import { updatePresence, type PresenceState } from './alertApi';

/** How long the backend keeps a presence report, in seconds (it takes at most 300). */
export const PRESENCE_TTL_SECONDS = 120;
/** How often presence is reported while nothing changes. */
export const PRESENCE_BEAT_MS = 60_000;
/** Without a key or pointer this long, a focused window counts as idle. */
export const IDLE_AFTER_MS = 5 * 60_000;

/** What presence is read from: the page's visibility and focus. */
export interface PresenceDocument {
  visibilityState: DocumentVisibilityState;
  hasFocus(): boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Settings for {@link startPresence}. */
export interface PresenceOptions {
  api: ForesignalClient;
  /** Presence needs a token; without one nothing is reported. */
  getToken: () => string | null;
  /** The page; `document` by default. */
  doc?: PresenceDocument;
  /** Where focus, blur and input events arrive; `window` by default. */
  win?: Pick<PresenceDocument, 'addEventListener' | 'removeEventListener'>;
  /** The clock. */
  now?: () => number;
  /** The heartbeat interval. */
  beatMs?: number;
}

/**
 * The presence a page is in: `background` when hidden, `idle` when shown but not focused or
 * without input for {@link IDLE_AFTER_MS}, else `active`.
 */
export function presenceState(
  doc: Pick<PresenceDocument, 'visibilityState' | 'hasFocus'>,
  sinceInputMs: number,
): PresenceState {
  if (doc.visibilityState !== 'visible') return 'background';
  if (!doc.hasFocus() || sinceInputMs >= IDLE_AFTER_MS) return 'idle';
  return 'active';
}

/**
 * Reports this device's presence (`updatePresence`, kind `web`) at once, whenever it changes
 * (visibility, focus, blur, input after idling), and every {@link PRESENCE_BEAT_MS} while the
 * page is open, so a desktop that is in use defers phone notifications. A failed report is logged
 * and tried again at the next beat. Returns the stop function.
 */
export function startPresence(options: PresenceOptions): () => void {
  const doc = options.doc ?? document;
  const win = options.win ?? window;
  const now = options.now ?? Date.now;
  let lastInput = now();
  let lastSent: PresenceState | undefined;
  const report = (force: boolean) => {
    if (!options.getToken()) return;
    const state = presenceState(doc, now() - lastInput);
    if (!force && state === lastSent) return;
    lastSent = state;
    updatePresence(options.api, state, PRESENCE_TTL_SECONDS).catch((error: unknown) => {
      lastSent = undefined;
      console.warn('ForeSignal: presence was not reported.', error);
    });
  };
  const changed = () => report(false);
  const input = () => {
    lastInput = now();
    if (lastSent === 'idle') report(false);
  };
  doc.addEventListener('visibilitychange', changed);
  win.addEventListener('focus', changed);
  win.addEventListener('blur', changed);
  win.addEventListener('pointerdown', input);
  win.addEventListener('keydown', input);
  const timer = setInterval(() => report(true), options.beatMs ?? PRESENCE_BEAT_MS);
  report(true);
  return () => {
    clearInterval(timer);
    doc.removeEventListener('visibilitychange', changed);
    win.removeEventListener('focus', changed);
    win.removeEventListener('blur', changed);
    win.removeEventListener('pointerdown', input);
    win.removeEventListener('keydown', input);
  };
}
