import { useSyncExternalStore } from 'react';
import type { ForesignalClient } from '../api/client';
import { getCallerFresh } from './callerApi';
import { useRead } from '../intel/useHypotheses';
import type { AlertFeed, AlertFeedSnapshot } from './AlertFeed';
import { canActOnAlerts } from './alertView';
import type { InboxFeed, InboxSnapshot } from './InboxFeed';

/** The alert feed's current snapshot, re-rendering on change. */
export function useAlertFeed(feed: AlertFeed): AlertFeedSnapshot {
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot);
}

/** The inbox's current snapshot, re-rendering on change. */
export function useInbox(feed: InboxFeed): InboxSnapshot {
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot);
}

/**
 * Whether the current token may change alerts (`getMe` scopes include `agent` or `admin`), read
 * again when the token changes. False without a token, while reading, and if the read fails.
 */
export function useCanActOnAlerts(
  api: ForesignalClient | undefined,
  token: string | null,
): boolean {
  const me = useRead(api, token ?? undefined, (client, _key, signal) =>
    getCallerFresh(client, signal),
  );
  return me.status === 'ready' && canActOnAlerts(me.value);
}
