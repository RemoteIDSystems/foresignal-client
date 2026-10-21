import type { TicketSource } from '../tickets';
import { withTicket } from '../tickets';
import { fetchSseTransport, type SseEvent, type SseFailure, type SseTransport } from './sse';

/** Silence after which a subscription's connection is taken for dead (servers beat every 15 s). */
export const SUBSCRIPTION_HEARTBEAT_MS = 45_000;
/** The first reconnect wait, doubled each failure up to {@link SUBSCRIPTION_BACKOFF_MAX_MS}. */
export const SUBSCRIPTION_BACKOFF_BASE_MS = 1_000;
export const SUBSCRIPTION_BACKOFF_MAX_MS = 30_000;

/** Where a subscription stands. */
export type SubscriptionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'stopped';

/** Settings for an {@link EventSubscription}. */
export interface EventSubscriptionOptions {
  /** Backend base URL; `/` (or empty) means same-origin. */
  baseUrl: string;
  /** The stream's path and query, such as `/v1/alerts/stream`. */
  path: string;
  /** The bearer token; with one, each connection carries a fresh stream ticket. */
  getToken: () => string | null;
  /** Mints the stream tickets. */
  tickets?: TicketSource;
  /** Whether the stream needs a token: without one it does not connect. */
  requireToken?: boolean;
  /** Headers every connection sends, such as `Foresignal-Device-Id`. */
  headers?: () => Record<string, string>;
  /** Called with each event but `heartbeat`, in order. */
  onEvent: (event: SseEvent) => void;
  /** Called when the state changes. */
  onState?: (state: SubscriptionState, error?: string) => void;
  /** Opens the connections; the client's own by default, a fake in tests. */
  transport?: SseTransport;
  /** Silence after which the connection is dropped and opened again. */
  heartbeatTimeoutMs?: number;
  /** Jitter source, in [0, 1). */
  random?: () => number;
}

/**
 * One resumable server-sent event stream other than the change stream: the alert lifecycle
 * (`streamAlerts`) and this device's inbox (`streamNotifications`). Each event's `id:` is kept and
 * sent as `Last-Event-ID` on a reconnect, so the server replays what was missed. A connection
 * silent for {@link SUBSCRIPTION_HEARTBEAT_MS} is dropped; reconnects back off, jittered, or wait
 * the server's `Retry-After`. With a token each connection carries a fresh `?ticket=`; a 401
 * drops the cached ticket. A `400 INVALID_CURSOR` forgets the resume point and connects again.
 */
export class EventSubscription {
  private state: SubscriptionState = 'idle';
  private generation = 0;
  private close?: () => void;
  private lastEventId?: string;
  private attempt = 0;
  private heartbeatTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private readonly transport: SseTransport;

  /** @param options Where to connect and what to do with the events. */
  constructor(private readonly options: EventSubscriptionOptions) {
    this.transport = options.transport ?? fetchSseTransport();
  }

  /** The current state. */
  get current(): SubscriptionState {
    return this.state;
  }

  /** Connects, unless already connected; without a needed token it waits idle. */
  start(): void {
    if (this.state === 'connecting' || this.state === 'open' || this.state === 'reconnecting')
      return;
    void this.connect();
  }

  /** Closes the connection and stops reconnecting; {@link start} opens it again. */
  stop(): void {
    this.disconnect();
    clearTimeout(this.retryTimer);
    this.setState('stopped');
  }

  /** Closes and reconnects now, keeping the resume point (a new token, say). */
  restart(): void {
    this.disconnect();
    clearTimeout(this.retryTimer);
    this.attempt = 0;
    void this.connect();
  }

  private async connect(): Promise<void> {
    const generation = ++this.generation;
    const token = this.options.getToken();
    if (this.options.requireToken && !token) {
      this.setState('idle');
      return;
    }
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let ticket: string | null = null;
    if (token && this.options.tickets) {
      try {
        ticket = await this.options.tickets.streamTicket();
      } catch {
        if (generation === this.generation)
          this.retry({}, 'The stream ticket could not be minted.');
        return;
      }
      if (generation !== this.generation) return;
    }
    const headers: Record<string, string> = { ...this.options.headers?.() };
    if (this.lastEventId !== undefined) headers['Last-Event-ID'] = this.lastEventId;
    const base = this.options.baseUrl.replace(/\/+$/, '');
    this.close = this.transport(
      { url: withTicket(`${base}${this.options.path}`, ticket), headers },
      {
        onOpen: () => {
          if (generation !== this.generation) return;
          this.attempt = 0;
          this.setState('open');
          this.armHeartbeat();
        },
        onActivity: () => generation === this.generation && this.armHeartbeat(),
        onEvent: (event) => {
          if (generation !== this.generation) return;
          if (event.id !== undefined) this.lastEventId = event.id;
          if (event.event !== 'heartbeat') this.options.onEvent(event);
        },
        onClose: (failure) => {
          if (generation !== this.generation) return;
          this.close = undefined;
          clearTimeout(this.heartbeatTimer);
          this.onClosed(failure);
        },
      },
    );
  }

  private onClosed(failure: SseFailure): void {
    const code = (failure.body as { code?: string } | undefined)?.code;
    if (failure.status === 400 && code === 'INVALID_CURSOR') {
      this.lastEventId = undefined;
      void this.connect();
      return;
    }
    if (failure.status === 401) this.options.tickets?.invalidate();
    const message =
      failure.status === undefined
        ? 'The connection to the server was lost.'
        : failure.status >= 200 && failure.status < 300
          ? 'The server closed the stream.'
          : `The server refused the stream (HTTP ${failure.status}${code ? ` ${code}` : ''}).`;
    this.retry(failure, message);
  }

  private retry(failure: SseFailure, message: string): void {
    clearTimeout(this.retryTimer);
    const backoff = Math.min(
      SUBSCRIPTION_BACKOFF_MAX_MS,
      SUBSCRIPTION_BACKOFF_BASE_MS * 2 ** this.attempt,
    );
    const wait = failure.retryAfterMs ?? backoff * (0.5 + (this.options.random ?? Math.random)());
    this.attempt++;
    this.setState('reconnecting', message);
    const generation = this.generation;
    this.retryTimer = setTimeout(() => {
      if (generation === this.generation && this.state === 'reconnecting') void this.connect();
    }, wait);
  }

  private armHeartbeat(): void {
    clearTimeout(this.heartbeatTimer);
    const generation = this.generation;
    this.heartbeatTimer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.disconnect();
      this.retry({}, 'No heartbeat from the server.');
    }, this.options.heartbeatTimeoutMs ?? SUBSCRIPTION_HEARTBEAT_MS);
  }

  private disconnect(): void {
    this.generation++;
    clearTimeout(this.heartbeatTimer);
    this.close?.();
    this.close = undefined;
  }

  private setState(state: SubscriptionState, error?: string): void {
    this.state = state;
    this.options.onState?.(state, error);
  }
}
