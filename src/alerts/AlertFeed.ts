import type { ForesignalClient } from '../api/client';
import { EventSubscription, type SubscriptionState } from '../api/stream/EventSubscription';
import type { SseEvent, SseTransport } from '../api/stream/sse';
import type { TicketSource } from '../api/tickets';
import { listOpenAlerts, type Alert, type AlertEvent } from './alertApi';

/** What the alert feed holds. */
export interface AlertFeedSnapshot {
  /** Open alerts (firing or acknowledged), newest first. */
  open: readonly Alert[];
  /** Alerts that fired while the page was open, newest first, for toasts; dismissed ones leave. */
  toasts: readonly Alert[];
  /** Where the live stream stands. */
  stream: SubscriptionState;
  /** Why the open alerts or the stream failed, if they did. */
  error?: string;
}

/** Settings for an {@link AlertFeed}. */
export interface AlertFeedOptions {
  api: ForesignalClient;
  baseUrl: string;
  getToken: () => string | null;
  tickets?: TicketSource;
  transport?: SseTransport;
}

/** How many toasts are kept at once; older ones leave. */
export const MAX_TOASTS = 3;

/**
 * The page's alerts: the open ones (`listAlerts`, firing or acknowledged) kept current by the
 * alert lifecycle stream (`streamAlerts`). A fired alert is added and toasted; an update or an
 * enrichment replaces the alert by id; a resolved one leaves. Suppressed alerts are never shown
 * (the stream leaves them out by default). Views read it with `useSyncExternalStore`.
 */
export class AlertFeed {
  private snapshot: AlertFeedSnapshot = { open: [], toasts: [], stream: 'idle' };
  private readonly listeners = new Set<() => void>();
  private readonly subscription: EventSubscription;
  private controller?: AbortController;
  private running = false;

  /** @param options The client and how to reach the stream. */
  constructor(private readonly options: AlertFeedOptions) {
    this.subscription = new EventSubscription({
      baseUrl: options.baseUrl,
      path: '/v1/alerts/stream',
      getToken: options.getToken,
      ...(options.tickets && { tickets: options.tickets }),
      ...(options.transport && { transport: options.transport }),
      onEvent: (event) => this.onEvent(event),
      onState: (stream, error) => this.update({ stream, ...(error !== undefined && { error }) }),
    });
  }

  /** Subscribes to changes; returns the unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The current snapshot (a new object after each change). */
  getSnapshot = (): AlertFeedSnapshot => this.snapshot;

  /** Reads the open alerts and opens the stream. */
  start(): void {
    this.running = true;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    listOpenAlerts(this.options.api, controller.signal).then(
      (alerts) => {
        if (controller.signal.aborted) return;
        const streamed = new Map(this.snapshot.open.map((alert) => [alert.id, alert]));
        // An alert the stream already updated keeps its newer revision.
        const merged = alerts.map((alert) => {
          const newer = streamed.get(alert.id);
          return newer && newer.rev > alert.rev ? newer : alert;
        });
        const known = new Set(merged.map((alert) => alert.id));
        this.update({
          open: sortNewest([
            ...merged,
            ...this.snapshot.open.filter((alert) => !known.has(alert.id)),
          ]),
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        this.update({ error: error instanceof Error ? error.message : String(error) });
      },
    );
    this.subscription.start();
  }

  /** Closes the stream. */
  stop(): void {
    this.running = false;
    this.controller?.abort();
    this.subscription.stop();
  }

  /** Reads again and reconnects, as after a token change; a feed not started stays stopped. */
  restart(): void {
    const running = this.running;
    this.stop();
    this.snapshot = { open: [], toasts: [], stream: 'idle' };
    this.emit();
    if (running) this.start();
  }

  /** Puts an alert a lifecycle call answered in place (the stream will say so too). */
  apply(alert: Alert): void {
    const current = this.snapshot.open.find((entry) => entry.id === alert.id);
    if (current && current.rev > alert.rev) return;
    const open =
      alert.state === 'resolved' || alert.suppressed
        ? this.snapshot.open.filter((entry) => entry.id !== alert.id)
        : sortNewest([alert, ...this.snapshot.open.filter((entry) => entry.id !== alert.id)]);
    const toasts =
      alert.state === 'firing'
        ? this.snapshot.toasts.map((entry) => (entry.id === alert.id ? alert : entry))
        : this.snapshot.toasts.filter((entry) => entry.id !== alert.id);
    this.update({ open, toasts });
  }

  /** Removes an alert's toast. */
  dismiss(id: number): void {
    this.update({ toasts: this.snapshot.toasts.filter((alert) => alert.id !== id) });
  }

  private onEvent(event: SseEvent): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }
    if (event.event === 'alert.enriched') {
      this.apply(parsed as Alert);
      return;
    }
    if (
      event.event !== 'alert' &&
      event.event !== 'alert.updated' &&
      event.event !== 'alert.resolved'
    )
      return;
    const { alert, type } = parsed as AlertEvent;
    if (!alert) return;
    const fresh =
      event.event === 'alert' &&
      type === 'fired' &&
      alert.state === 'firing' &&
      !alert.suppressed &&
      !this.snapshot.open.some((entry) => entry.id === alert.id);
    this.apply(alert);
    if (fresh) {
      this.update({ toasts: [alert, ...this.snapshot.toasts].slice(0, MAX_TOASTS) });
    }
  }

  private update(patch: Partial<AlertFeedSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Newest first by when they fired, then by id. */
function sortNewest(alerts: readonly Alert[]): Alert[] {
  return [...alerts].sort((a, b) => Date.parse(b.firedAt) - Date.parse(a.firedAt) || b.id - a.id);
}
