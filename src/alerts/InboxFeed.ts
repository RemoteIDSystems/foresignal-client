import type { ForesignalClient } from '../api/client';
import { EventSubscription, type SubscriptionState } from '../api/stream/EventSubscription';
import type { SseEvent, SseTransport } from '../api/stream/sse';
import type { TicketSource } from '../api/tickets';
import { getBadge, listInbox, markRead, type Badge, type InboxItem } from './alertApi';

/** What the inbox holds. */
export interface InboxSnapshot {
  /** This device's unread counts; undefined until read, and without a token. */
  badge?: Badge;
  /** The newest inbox items read so far, newest first. */
  items: readonly InboxItem[];
  /** Whether the list has been read, is being read, or failed. */
  list: 'idle' | 'loading' | 'ready' | 'error';
  /** Where the live stream stands. */
  stream: SubscriptionState;
  /** Why the last read failed, if it did. */
  error?: string;
}

/** Settings for an {@link InboxFeed}. */
export interface InboxFeedOptions {
  api: ForesignalClient;
  baseUrl: string;
  getToken: () => string | null;
  getDeviceId: () => string;
  tickets?: TicketSource;
  transport?: SseTransport;
}

/**
 * This device's notification inbox: its badge (`getNotificationBadge`), its newest items
 * (`listNotifications`, read when the bell first opens), and the inbox stream
 * (`streamNotifications`), whose `notification` events add items and whose `badge` events move the
 * counts. Read state is per device: the client's `Foresignal-Device-Id` goes on every request and
 * on the stream. The inbox needs a token; without one it holds nothing and does not connect.
 * Marking items read never acknowledges an alert.
 */
export class InboxFeed {
  private snapshot: InboxSnapshot = { items: [], list: 'idle', stream: 'idle' };
  private readonly listeners = new Set<() => void>();
  private readonly subscription: EventSubscription;
  private controller?: AbortController;
  private running = false;

  /** @param options The client and how to reach the stream. */
  constructor(private readonly options: InboxFeedOptions) {
    this.subscription = new EventSubscription({
      baseUrl: options.baseUrl,
      path: '/v1/notifications/stream',
      getToken: options.getToken,
      requireToken: true,
      headers: () => ({ 'Foresignal-Device-Id': options.getDeviceId() }),
      ...(options.tickets && { tickets: options.tickets }),
      ...(options.transport && { transport: options.transport }),
      onEvent: (event) => this.onEvent(event),
      onState: (stream) => this.update({ stream }),
    });
  }

  /** Subscribes to changes; returns the unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The current snapshot. */
  getSnapshot = (): InboxSnapshot => this.snapshot;

  /** Reads the badge and opens the stream, when there is a token. */
  start(): void {
    this.running = true;
    this.controller?.abort();
    if (!this.options.getToken()) return;
    const controller = new AbortController();
    this.controller = controller;
    getBadge(this.options.api, controller.signal).then(
      (badge) => !controller.signal.aborted && this.update({ badge }),
      (error: unknown) => !controller.signal.aborted && this.update({ error: messageOf(error) }),
    );
    this.subscription.start();
  }

  /** Closes the stream. */
  stop(): void {
    this.running = false;
    this.controller?.abort();
    this.subscription.stop();
  }

  /** Forgets everything and starts again, as after a token change; a feed not started stays stopped. */
  restart(): void {
    const running = this.running;
    this.stop();
    this.snapshot = { items: [], list: 'idle', stream: 'idle' };
    this.emit();
    if (running) this.start();
  }

  /** Reads the newest page of the inbox, unless it is read or being read. */
  load(): void {
    if (
      !this.options.getToken() ||
      this.snapshot.list === 'loading' ||
      this.snapshot.list === 'ready'
    )
      return;
    this.update({ list: 'loading' });
    listInbox(this.options.api).then(
      (page) => this.update({ list: 'ready', items: mergeItems(page.items, this.snapshot.items) }),
      (error: unknown) => this.update({ list: 'error', error: messageOf(error) }),
    );
  }

  /** Marks one item read on this device. */
  async markRead(id: number): Promise<void> {
    const badge = await markRead(this.options.api, { ids: [id] });
    this.update({
      badge,
      items: this.snapshot.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    });
  }

  /** Marks everything up to the newest item read on this device. */
  async markAllRead(): Promise<void> {
    const upToId = Math.max(
      this.snapshot.badge?.latestId ?? 0,
      ...this.snapshot.items.map((item) => item.id),
    );
    if (upToId <= 0) return;
    const badge = await markRead(this.options.api, { upToId });
    this.update({
      badge,
      items: this.snapshot.items.map((item) =>
        item.id <= upToId ? { ...item, read: true } : item,
      ),
    });
  }

  private onEvent(event: SseEvent): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }
    if (event.event === 'badge') this.update({ badge: parsed as Badge });
    else if (event.event === 'notification') {
      this.update({ items: mergeItems([parsed as InboxItem], this.snapshot.items) });
    }
  }

  private update(patch: Partial<InboxSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Items by id, the newer copy winning, newest first. */
export function mergeItems(
  incoming: readonly InboxItem[],
  kept: readonly InboxItem[],
): InboxItem[] {
  const byId = new Map(kept.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

/** An error's message. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
