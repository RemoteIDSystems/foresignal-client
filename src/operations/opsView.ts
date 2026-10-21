import type { BadgeTone } from '../ui/Badge';
import type {
  BriefingRun,
  Chronicle,
  Delivery,
  ExportJob,
  HealthStatus,
  Sink,
  SinkStatus,
  SourceHealth,
} from './opsApi';

/** How often the console's polled panels read again, in ms; the alert queue is live (029). */
export const OPS_REFRESH_MS = 30_000;

/** How many rows a queue panel reads. */
export const OPS_ROWS = 20;

/** The health statuses, worst first, as the board orders sources. */
export const HEALTH_ORDER: readonly HealthStatus[] = [
  'failing',
  'degraded',
  'idle',
  'healthy',
  'disabled',
];

/** The source-health board's filter: one status, every enabled source, or every source. */
export type HealthFilter = HealthStatus | 'enabled' | 'all';

/** The chip tone of each health status. */
export const HEALTH_TONE: Readonly<Record<HealthStatus, BadgeTone>> = {
  healthy: 'success',
  degraded: 'warning',
  failing: 'danger',
  idle: 'neutral',
  disabled: 'neutral',
};

/** The chip tone of each export job status. */
export const JOB_TONE: Readonly<Record<ExportJob['status'], BadgeTone>> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  DONE: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

/** The chip tone of each briefing run status. */
export const RUN_TONE: Readonly<Record<BriefingRun['status'], BadgeTone>> = {
  running: 'info',
  succeeded: 'success',
  fallback: 'warning',
  failed: 'danger',
};

/** The chip tone of each sink state. */
export const SINK_TONE: Readonly<Record<SinkStatus['state'], BadgeTone>> = {
  RUNNING: 'success',
  RESYNCING: 'warning',
  FAILING: 'danger',
  STOPPED: 'neutral',
};

/** The chip tone of each delivery status. */
export const DELIVERY_TONE: Readonly<Record<Delivery['status'], BadgeTone>> = {
  delivered: 'success',
  pending: 'info',
  failed: 'danger',
  suppressed: 'neutral',
  unacked: 'warning',
};

/** The chip tone of each chronicle status. */
export const CHRONICLE_TONE: Readonly<Record<Chronicle['status'], BadgeTone>> = {
  active: 'success',
  proposed: 'info',
  paused: 'warning',
  stopped: 'neutral',
  archived: 'neutral',
};

/** How many sources have each health status. */
export function healthCounts(health: readonly SourceHealth[]): Record<HealthStatus, number> {
  const counts: Record<HealthStatus, number> = {
    failing: 0,
    degraded: 0,
    idle: 0,
    healthy: 0,
    disabled: 0,
  };
  for (const entry of health) counts[entry.status] += 1;
  return counts;
}

/** The board's rows for a filter, worst status first, then by source id. */
export function filterHealth(
  health: readonly SourceHealth[],
  filter: HealthFilter,
): SourceHealth[] {
  return health
    .filter((entry) =>
      filter === 'all'
        ? true
        : filter === 'enabled'
          ? entry.status !== 'disabled'
          : entry.status === filter,
    )
    .sort(
      (a, b) =>
        HEALTH_ORDER.indexOf(a.status) - HEALTH_ORDER.indexOf(b.status) ||
        a.sourceId.localeCompare(b.sourceId),
    );
}

/** An export job's progress, which the backend gives as a whole percentage (0–100). */
export function progressText(job: ExportJob): string {
  return `${Math.round(Math.min(100, Math.max(0, job.progress)))}%`;
}

/** A sink's state: its status's, else the sink's own, else unknown. */
export function sinkState(
  sink: Sink,
  status: SinkStatus | undefined,
): SinkStatus['state'] | undefined {
  return status?.state ?? sink.state ?? undefined;
}

/** A sink's lag, as the backend counts it in sequence numbers. */
export function lagText(status: SinkStatus | undefined): string {
  return status?.lagSeq != null ? `${status.lagSeq.toLocaleString('en-US')} seq` : '—';
}
