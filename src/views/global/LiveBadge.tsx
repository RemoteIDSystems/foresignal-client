import { useSyncExternalStore } from 'react';
import type { ChangeStream, StreamStatus } from '../../api/stream/ChangeStream';
import styles from './GlobalDashboard.module.css';

/** The badge's words for each stream state. */
const LABELS: Record<StreamStatus['state'], string> = {
  idle: 'OFFLINE',
  connecting: 'CONNECTING',
  live: 'LIVE',
  reconnecting: 'RECONNECTING',
  paused: 'PAUSED',
};

/** A status for no stream at all. */
const NO_STREAM: StreamStatus = { state: 'idle', filterPending: false, connections: 0, attempt: 0 };
const noSubscription = () => () => {};

/**
 * The time HUD's live badge, as the Global mock draws it (green `◆ LIVE`), driven by the live
 * stream: green while connected, amber while connecting or reconnecting (the reason and the next
 * attempt in its title), gray while paused or off. `data-state`, `data-filter-version` and
 * `data-last-seq` expose the stream for the end-to-end checks.
 */
export function LiveBadge({ stream }: { stream?: ChangeStream }) {
  const status = useSyncExternalStore(
    stream?.subscribeStatus ?? noSubscription,
    stream?.getStatus ?? (() => NO_STREAM),
  );
  const title =
    status.state === 'live'
      ? `Live: connected${status.lastSeq !== undefined ? ` (change ${status.lastSeq})` : ''}`
      : status.state === 'reconnecting'
        ? `${status.error ?? 'Reconnecting'}${status.retryAt ? ` Retrying at ${new Date(status.retryAt).toLocaleTimeString()}.` : ''}`
        : status.state === 'paused'
          ? 'Paused while the page is hidden; caught up when it shows again.'
          : status.state === 'connecting'
            ? 'Connecting to the live stream.'
            : 'Not connected to the live stream.';
  return (
    <span
      className={styles.live}
      data-testid="live-state"
      data-state={status.state}
      data-filter-version={status.filterVersion}
      data-filter-pending={status.filterPending || undefined}
      data-last-seq={status.lastSeq}
      data-connections={status.connections}
      title={title}
      role="status"
    >
      ◆ {LABELS[status.state]}
    </span>
  );
}
