import type { ForesignalClient } from '../client';
import type { components } from '../generated/schema';
import type { TicketSource } from '../tickets';
import { withTicket } from '../tickets';
import { fetchSseTransport, type SseEvent, type SseFailure, type SseTransport } from './sse';

/** One record version from the change feed (`change` events and `listChanges` items). */
export type Change = components['schemas']['Change'];
/** A conflated, non-persisted position or kinematic update (`live` events). */
export type LiveEvent = components['schemas']['LiveEvent'];
/** The first event on the stream. */
export type HelloEvent = components['schemas']['HelloEvent'];
/** Confirms a filter swap: every later event uses the new filter. */
export type FilterAppliedEvent = components['schemas']['FilterAppliedEvent'];
/** The server is about to close the stream. */
export type ResetEvent = components['schemas']['ResetEvent'];
/** Live updates were lost; the view's current state is to be fetched again. */
export type ResyncEvent = components['schemas']['ResyncEvent'];

/** The kind of the change records that announce a product's new frames (`RasterFrameEvent`). */
export const RASTER_FRAME_KIND = 'raster-frame';

/** Most kinds a `changes` filter takes (the spec's `maxItems`); more are not filtered by kind. */
export const MAX_FILTER_KINDS = 100;

/** The heartbeat the backend sends by default is every 15 s; three missed mean the link is dead. */
export const HEARTBEAT_TIMEOUT_MS = 45_000;

/** The spec asks for map pans to be debounced 300–500 ms before a filter swap. */
export const FILTER_DEBOUNCE_MS = 400;

/** First wait before reconnecting, doubled per failure in a row up to {@link BACKOFF_MAX_MS}. */
export const BACKOFF_BASE_MS = 1_000;
/** Longest wait before reconnecting. */
export const BACKOFF_MAX_MS = 30_000;

/** How long the page may be hidden before the stream is closed, to be caught up on return. */
export const HIDDEN_GRACE_MS = 60_000;

/**
 * How long the stream stays open after its last holder lets go, so a view that is unmounted and
 * mounted again at once (a route change back, React's development double effects) keeps the one
 * connection rather than opening a second.
 */
export const RELEASE_GRACE_MS = 1_000;

/** Changes asked for per catch-up page (the spec's default and the most worth one request). */
const CATCH_UP_LIMIT = 1_000;
/** Catch-up pages read before giving up and reloading the layers instead. */
const CATCH_UP_PAGES = 10;

/** The kinds and area the stream's `changes` topic is narrowed to. */
export interface StreamFilter {
  /** Kinds to hear about; none or more than {@link MAX_FILTER_KINDS} hears every kind. */
  kinds?: readonly string[];
  /** `[west, south, east, north]`; `west > east` crosses the antimeridian. None is the world. */
  bbox?: readonly [number, number, number, number];
}

/** Where the stream is in its life. */
export type StreamState =
  /** Not started, or stopped. */
  | 'idle'
  /** Opening the first connection. */
  | 'connecting'
  /** Connected: `hello` received and events flowing. */
  | 'live'
  /** Lost; waiting to reconnect (with `retryAt`) or reconnecting. */
  | 'reconnecting'
  /** Closed while the page is hidden; caught up when it shows again. */
  | 'paused';

/** What the stream is doing, for the LIVE badge and for tests. */
export interface StreamStatus {
  state: StreamState;
  /** The `streamId` from the current connection's `hello`. */
  streamId?: string;
  /** The last change seq applied (from the stream or catch-up). */
  lastSeq?: number;
  /** The server's filter version, as confirmed by `hello` or `filter-applied`. */
  filterVersion?: number;
  /** The `atSeq` of the last `filter-applied`: the last change under the old filter. */
  filterAppliedAtSeq?: number;
  /** True while a filter swap waits for the debounce, its PATCH or its `filter-applied`. */
  filterPending: boolean;
  /** Connections opened so far (the first included). */
  connections: number;
  /** Failures in a row since the last good connection. */
  attempt: number;
  /** When the next reconnect starts (epoch ms), while waiting. */
  retryAt?: number;
  /** Why the last connection ended, in words. */
  error?: string;
}

/** Why the layers are to be loaded again. */
export type ResyncReason =
  | ResyncEvent['reason']
  /** The server could not resume from our cursor (410 RESYNC_REQUIRED, `reset`). */
  | 'resync_required'
  /** The cursor was rejected (400 INVALID_CURSOR). */
  | 'invalid_cursor'
  /** Catching up would have taken more than {@link CATCH_UP_PAGES} pages. */
  | 'catch_up_cap';

/** What the stream tells its listeners. Every method is optional. */
export interface StreamListener {
  /**
   * Record versions in seq order, each once: from the live stream, or from `listChanges` when
   * catching up after a reconnect or a hidden page.
   */
  changes?(changes: readonly Change[], origin: 'stream' | 'catch-up'): void;
  /** A conflated live position update (no seq; not replayed). */
  live?(event: LiveEvent): void;
  /** Updates were lost: reload the affected layers from their current state. */
  resync?(reason: ResyncReason): void;
}

/** Whether the page is hidden, and when that changes. */
export interface VisibilitySource {
  hidden(): boolean;
  subscribe(listener: () => void): () => void;
}

/** Settings for {@link ChangeStream}. */
export interface ChangeStreamOptions {
  /** The API client, for `listChanges` and `updateEventStreamFilter`. */
  api: ForesignalClient;
  /** Backend base URL; `/` (or empty) means same-origin. */
  baseUrl: string;
  /** The bearer token; with one, each connection carries a fresh stream ticket. */
  getToken: () => string | null;
  /** Mints the stream tickets. */
  tickets?: TicketSource;
  /** Opens the connections; the client's own by default, a fake in tests. */
  transport?: SseTransport;
  /** Silence after which the connection is taken for dead. */
  heartbeatTimeoutMs?: number;
  /** Debounce before a new filter is sent. */
  filterDebounceMs?: number;
  /** How long the page may be hidden before the stream closes. */
  hiddenGraceMs?: number;
  /** The page's visibility; `document` by default. */
  visibility?: VisibilitySource;
  /** Jitter source, in [0, 1). */
  random?: () => number;
  /** The clock, for `retryAt`. */
  now?: () => number;
}

/** The parts of a stream filter the server sees, as sent. */
interface WireFilter {
  kind?: string[];
  bbox?: string;
}

/**
 * The client's one live connection to the backend: `streamEvents` (`GET /v1/events/stream`), a
 * multiplexed server-sent event stream, here subscribed to the `changes` topic and narrowed to
 * the drawn kinds and the view.
 *
 * - **Re-filtering**: {@link setFilter} is debounced ({@link FILTER_DEBOUNCE_MS}) and sent to the
 *   open stream with `updateEventStreamFilter` (PATCH, with the anonymous `streamKey`), never by
 *   reconnecting; the swap counts as done when `filter-applied` arrives.
 * - **Resume**: every change event's `id:` is kept, and a reconnect sends it as `Last-Event-ID`, so
 *   the server replays what was missed. Before reconnecting, the gap is read with `listChanges`
 *   (`after=<lastSeq>`) — after the page was hidden ({@link HIDDEN_GRACE_MS}) as after a drop — and
 *   changes are handed on once each, by seq.
 * - **Liveness**: a connection silent for {@link HEARTBEAT_TIMEOUT_MS} (the server sends heartbeats
 *   every 15 s) is dropped. Reconnects back off from {@link BACKOFF_BASE_MS} to
 *   {@link BACKOFF_MAX_MS}, jittered, or wait the server's `Retry-After`.
 * - **Resync**: `410 RESYNC_REQUIRED` (from the stream or `listChanges`), a `reset` with
 *   `resync_required`, a `resync` event or a catch-up too long to read all tell listeners to
 *   reload their layers ({@link StreamListener.resync}).
 * - **Credentials**: with a token, each connection carries a fresh `?ticket=` from
 *   `createStreamTicket`, the spec's way to authorize a stream without an `Authorization` header;
 *   without one the stream relies on open reads.
 *
 * Read over `fetch` ({@link fetchSseTransport}) rather than `EventSource`, which can neither send
 * `Last-Event-ID` on a fresh connection nor say why a stream was refused. One instance serves the
 * whole page ({@link retain}), so over HTTP/1.1 it takes one of the browser's six connections.
 */
export class ChangeStream {
  private readonly listeners = new Set<StreamListener>();
  private readonly statusListeners = new Set<() => void>();
  private snapshot: StreamStatus = {
    state: 'idle',
    filterPending: false,
    connections: 0,
    attempt: 0,
  };
  private readonly transport: SseTransport;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly visibility?: VisibilitySource;
  private stopVisibility?: () => void;
  private holders = 0;

  /** The filter wanted now, and the one the server has (sent on connect or by PATCH). */
  private desired: WireFilter = {};
  private sent?: WireFilter;
  /** A PATCH sent, waiting for its `filter-applied`. */
  private patching?: WireFilter;
  private filterTimer?: ReturnType<typeof setTimeout>;

  /** The current connection, and a generation that makes callbacks of closed ones inert. */
  private close?: () => void;
  private generation = 0;
  private streamId?: string;
  private streamKey?: string;
  private lastEventId?: string;
  private lastSeq?: number;

  private heartbeatTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private hiddenTimer?: ReturnType<typeof setTimeout>;
  private releaseTimer?: ReturnType<typeof setTimeout>;

  /** @param options Where to connect and how; see {@link ChangeStreamOptions}. */
  constructor(private readonly options: ChangeStreamOptions) {
    this.transport = options.transport ?? fetchSseTransport();
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.visibility = options.visibility ?? documentVisibility();
  }

  /** The current status; the same object until something changes (for `useSyncExternalStore`). */
  getStatus = (): StreamStatus => this.snapshot;

  /** Calls `listener` after every status change; returns an unsubscribe function. */
  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  /** Adds a listener for changes, live updates and resyncs; returns a function that removes it. */
  listen(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Keeps the stream open while held: the first holder starts it, and it stops
   * {@link RELEASE_GRACE_MS} after the last release, so every view that wants live data shares
   * one connection.
   */
  retain(): () => void {
    this.holders++;
    clearTimeout(this.releaseTimer);
    this.releaseTimer = undefined;
    if (this.holders === 1) this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders--;
      if (this.holders > 0) return;
      this.releaseTimer = setTimeout(() => {
        this.releaseTimer = undefined;
        if (this.holders === 0) this.stop();
      }, RELEASE_GRACE_MS);
    };
  }

  /** Opens the stream (if not open) and follows the page's visibility. */
  start(): void {
    if (this.snapshot.state !== 'idle') return;
    this.stopVisibility = this.visibility?.subscribe(() => this.onVisibility());
    void this.connect();
  }

  /** Closes the stream and forgets its cursor; a later {@link start} begins live from then. */
  stop(): void {
    this.disconnect();
    this.stopVisibility?.();
    this.stopVisibility = undefined;
    clearTimeout(this.retryTimer);
    clearTimeout(this.hiddenTimer);
    clearTimeout(this.filterTimer);
    clearTimeout(this.releaseTimer);
    this.retryTimer = this.hiddenTimer = this.filterTimer = this.releaseTimer = undefined;
    this.lastEventId = undefined;
    this.lastSeq = undefined;
    this.patching = undefined;
    this.sent = undefined;
    this.update({
      state: 'idle',
      streamId: undefined,
      retryAt: undefined,
      attempt: 0,
      filterPending: false,
      lastSeq: undefined,
    });
  }

  /**
   * Narrows the stream to these kinds and this area. Debounced; an open stream is re-filtered in
   * place, and a closed one opens with it.
   */
  setFilter(filter: StreamFilter): void {
    const wire = toWire(filter);
    if (sameWire(wire, this.desired)) return;
    this.desired = wire;
    clearTimeout(this.filterTimer);
    this.update({ filterPending: !sameWire(wire, this.patching ?? this.sent) });
    this.filterTimer = setTimeout(() => {
      this.filterTimer = undefined;
      void this.applyFilter();
    }, this.options.filterDebounceMs ?? FILTER_DEBOUNCE_MS);
  }

  /**
   * Drops the connection as a network failure would, and reconnects at once (for the e2e check
   * that a forced reconnect loses nothing, and for a manual retry).
   */
  reconnectNow(): void {
    if (this.snapshot.state === 'idle') return;
    this.disconnect();
    clearTimeout(this.retryTimer);
    void this.connect();
  }

  // ---- Connection ------------------------------------------------------------------------------

  private async connect(): Promise<void> {
    const generation = ++this.generation;
    this.update({
      state: this.snapshot.connections === 0 ? 'connecting' : 'reconnecting',
      retryAt: undefined,
    });
    if (this.lastSeq !== undefined) {
      await this.catchUp(generation);
      if (generation !== this.generation) return;
    }
    let ticket: string | null = null;
    if (this.options.getToken() && this.options.tickets) {
      try {
        ticket = await this.options.tickets.streamTicket();
      } catch (cause) {
        if (generation !== this.generation) return;
        this.retry({ cause }, 'The stream ticket could not be minted.');
        return;
      }
      if (generation !== this.generation) return;
    }
    const filter = this.desired;
    // Resume from the last change seen, or from the first connection's watermark.
    const cursor =
      this.lastSeq === undefined ? undefined : withChangesCursor(this.lastEventId, this.lastSeq);
    const headers: Record<string, string> = cursor ? { 'Last-Event-ID': cursor } : {};
    this.sent = filter;
    this.update({ connections: this.snapshot.connections + 1 });
    this.close = this.transport(
      { url: withTicket(this.streamUrl(filter), ticket), headers },
      {
        onOpen: () => generation === this.generation && this.armHeartbeat(),
        onActivity: () => generation === this.generation && this.armHeartbeat(),
        onEvent: (event) => generation === this.generation && this.onEvent(event),
        onClose: (failure) => {
          if (generation !== this.generation) return;
          this.close = undefined;
          clearTimeout(this.heartbeatTimer);
          this.onClosed(failure);
        },
      },
    );
  }

  /** Closes the current connection without reconnecting. */
  private disconnect(): void {
    this.generation++;
    clearTimeout(this.heartbeatTimer);
    this.close?.();
    this.close = undefined;
    this.streamId = undefined;
    this.streamKey = undefined;
  }

  private streamUrl(filter: WireFilter): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    const query = new URLSearchParams({ topics: 'changes' });
    if (filter.kind) query.set('changes.kind', filter.kind.join(','));
    if (filter.bbox) query.set('changes.bbox', filter.bbox);
    return `${base}/v1/events/stream?${query.toString()}`;
  }

  private armHeartbeat(): void {
    clearTimeout(this.heartbeatTimer);
    const generation = this.generation;
    this.heartbeatTimer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.disconnect();
      this.retry({}, 'No heartbeat from the server.');
    }, this.options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS);
  }

  private onClosed(failure: SseFailure): void {
    this.streamId = undefined;
    this.streamKey = undefined;
    const code = problemCode(failure.body);
    if (failure.status === 410 || code === 'RESYNC_REQUIRED') {
      this.forgetCursor();
      this.emitResync('resync_required');
      void this.connect();
      return;
    }
    if (failure.status === 400 && code === 'INVALID_CURSOR') {
      this.forgetCursor();
      this.emitResync('invalid_cursor');
      void this.connect();
      return;
    }
    const message =
      failure.status === undefined
        ? 'The connection to the server was lost.'
        : failure.status >= 200 && failure.status < 300
          ? 'The server closed the stream.'
          : `The server refused the stream (HTTP ${failure.status}${code ? ` ${code}` : ''}).`;
    if (failure.status === 401) this.options.tickets?.invalidate();
    this.retry(failure, message);
  }

  /** Waits (backoff, or the server's Retry-After) and connects again. */
  private retry(failure: SseFailure, message: string): void {
    clearTimeout(this.retryTimer);
    const attempt = this.snapshot.attempt;
    const backoff = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
    const wait = failure.retryAfterMs ?? backoff * (0.5 + this.random());
    const generation = this.generation;
    this.update({
      state: 'reconnecting',
      attempt: attempt + 1,
      retryAt: this.now() + wait,
      error: message,
      streamId: undefined,
    });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (generation === this.generation && this.snapshot.state === 'reconnecting') {
        void this.connect();
      }
    }, wait);
  }

  // ---- Events ----------------------------------------------------------------------------------

  private onEvent(event: SseEvent): void {
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch {
      console.warn(`ForeSignal: unreadable ${event.event} event on the live stream.`);
      return;
    }
    switch (event.event) {
      case 'hello':
        this.onHello(data as HelloEvent);
        break;
      case 'change':
        this.onChange(data as Change, event.id);
        break;
      case 'live':
        for (const listener of this.listeners) listener.live?.(data as LiveEvent);
        break;
      case 'resync':
        this.emitResync((data as ResyncEvent).reason);
        break;
      case 'filter-applied':
        this.onFilterApplied(data as FilterAppliedEvent);
        break;
      case 'reset':
        this.onReset(data as ResetEvent);
        break;
      default:
        // `heartbeat` and any event of a topic not subscribed: the activity was enough.
        break;
    }
  }

  private onHello(hello: HelloEvent): void {
    this.streamId = hello.streamId;
    this.streamKey = hello.streamKey ?? undefined;
    // Before any change, the watermark is where a later resume starts.
    this.lastSeq ??= hello.watermarkSeq;
    this.update({
      state: 'live',
      streamId: hello.streamId,
      filterVersion: hello.filterVersion,
      attempt: 0,
      retryAt: undefined,
      error: undefined,
      lastSeq: this.lastSeq,
    });
    // The filter may have changed while connecting.
    this.patching = undefined;
    if (!sameWire(this.desired, this.sent)) void this.applyFilter();
    else this.update({ filterPending: this.filterTimer !== undefined });
  }

  private onChange(change: Change, id: string | undefined): void {
    if (id) this.lastEventId = id;
    if (this.lastSeq !== undefined && change.seq <= this.lastSeq) return;
    this.lastSeq = change.seq;
    this.update({ lastSeq: change.seq });
    for (const listener of this.listeners) listener.changes?.([change], 'stream');
  }

  private onReset(reset: ResetEvent): void {
    if (reset.reason === 'resync_required') {
      this.forgetCursor();
      this.emitResync('resync_required');
    } else if (reset.resumeAfter !== null && reset.resumeAfter !== undefined) {
      this.lastSeq = reset.resumeAfter;
      this.lastEventId = withChangesCursor(this.lastEventId, reset.resumeAfter);
    }
    // The server closes the stream next; reconnect at once rather than after a backoff.
    this.disconnect();
    void this.connect();
  }

  private emitResync(reason: ResyncReason): void {
    for (const listener of this.listeners) listener.resync?.(reason);
  }

  private forgetCursor(): void {
    this.lastEventId = undefined;
    this.lastSeq = undefined;
    this.update({ lastSeq: undefined });
  }

  // ---- Catch-up --------------------------------------------------------------------------------

  /**
   * Reads what changed since {@link lastSeq} with `listChanges`, under the current filter, and hands
   * it on. A gap older than the server keeps (410) or too long to read means a resync instead. A
   * catch-up that fails otherwise is skipped: the stream's own replay from `Last-Event-ID` covers it.
   */
  private async catchUp(generation: number): Promise<void> {
    const filter = this.desired;
    for (let read = 0; read < CATCH_UP_PAGES; read++) {
      const after = this.lastSeq;
      if (after === undefined) return;
      let result;
      try {
        result = await this.options.api.GET('/v1/changes', {
          params: {
            query: { after, kind: filter.kind, bbox: filter.bbox, limit: CATCH_UP_LIMIT },
          },
        });
      } catch {
        return;
      }
      if (generation !== this.generation) return;
      const { data, error, response } = result;
      if (response.status === 410 || problemCode(error) === 'RESYNC_REQUIRED') {
        this.forgetCursor();
        this.emitResync('resync_required');
        return;
      }
      if (!data) return;
      // JSON is asked for (the default format), so the body is a page.
      const page = data as components['schemas']['ChangePage'];
      const fresh = page.items.filter((change) => change.seq > after);
      this.lastSeq = Math.max(after, page.lastSeq);
      this.lastEventId = withChangesCursor(this.lastEventId, this.lastSeq);
      this.update({ lastSeq: this.lastSeq });
      if (fresh.length > 0) {
        for (const listener of this.listeners) listener.changes?.(fresh, 'catch-up');
      }
      if (!page.hasMore) return;
    }
    // Too far behind to read change by change: reload, and resume from the server's head.
    this.forgetCursor();
    this.emitResync('catch_up_cap');
  }

  // ---- Filter ----------------------------------------------------------------------------------

  /** Sends the wanted filter to the open stream, one PATCH at a time. */
  private async applyFilter(): Promise<void> {
    const streamId = this.streamId;
    const generation = this.generation;
    if (!streamId || this.snapshot.state !== 'live' || this.patching) {
      // Sent on the next connection, or after the PATCH in flight is confirmed.
      return;
    }
    const filter = this.desired;
    if (sameWire(filter, this.sent)) {
      this.update({ filterPending: false });
      return;
    }
    this.patching = filter;
    this.update({ filterPending: true });
    let response: Response;
    try {
      ({ response } = await this.options.api.PATCH('/v1/events/stream/{streamId}/filter', {
        params: {
          path: { streamId },
          header: this.streamKey ? { 'Foresignal-Stream-Key': this.streamKey } : undefined,
        },
        body: { changes: wireBody(filter) },
      }));
    } catch {
      response = new Response(null, { status: 599 });
    }
    if (generation !== this.generation) return;
    if (response.ok) {
      // Applied on the server; confirmed by the `filter-applied` that follows.
      return;
    }
    this.patching = undefined;
    if (response.status === 404) {
      // The stream is gone (closed, or another principal's): a new one opens with the filter.
      this.reconnectNow();
      return;
    }
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => {
      this.filterTimer = undefined;
      void this.applyFilter();
    }, BACKOFF_MAX_MS / 6);
  }

  private onFilterApplied(applied: FilterAppliedEvent): void {
    if (this.patching) this.sent = this.patching;
    this.patching = undefined;
    const pending = !sameWire(this.desired, this.sent);
    this.update({
      filterVersion: applied.filterVersion,
      filterAppliedAtSeq: applied.atSeq,
      filterPending: pending || this.filterTimer !== undefined,
    });
    if (pending && this.filterTimer === undefined) void this.applyFilter();
  }

  // ---- Visibility ------------------------------------------------------------------------------

  private onVisibility(): void {
    if (!this.visibility) return;
    if (this.visibility.hidden()) {
      if (this.hiddenTimer !== undefined || this.snapshot.state === 'idle') return;
      this.hiddenTimer = setTimeout(() => {
        this.hiddenTimer = undefined;
        this.disconnect();
        clearTimeout(this.retryTimer);
        this.update({ state: 'paused', retryAt: undefined, streamId: undefined });
      }, this.options.hiddenGraceMs ?? HIDDEN_GRACE_MS);
      return;
    }
    clearTimeout(this.hiddenTimer);
    this.hiddenTimer = undefined;
    if (this.snapshot.state === 'paused') void this.connect();
  }

  private update(patch: Partial<StreamStatus>): void {
    const next = { ...this.snapshot, ...patch };
    const keys = Object.keys(next) as (keyof StreamStatus)[];
    if (keys.every((key) => next[key] === this.snapshot[key])) return;
    this.snapshot = next;
    for (const listener of this.statusListeners) listener();
  }
}

/** A stream filter as the server takes it: kinds (unless too many) and the bbox string. */
function toWire(filter: StreamFilter): WireFilter {
  const wire: WireFilter = {};
  const kinds = [...new Set(filter.kinds ?? [])].sort();
  if (kinds.length > 0 && kinds.length <= MAX_FILTER_KINDS) wire.kind = kinds;
  if (filter.bbox) {
    const [west, south, east, north] = filter.bbox;
    const whole = west <= -180 && east >= 180 && south <= -90 && north >= 90;
    if (!whole) wire.bbox = [west, south, east, north].map(formatDegrees).join(',');
  }
  return wire;
}

/** The `changes` block of a PATCH: every field given, so the swap replaces the old filter whole. */
function wireBody(filter: WireFilter): components['schemas']['EventStreamChangesFilter'] {
  return {
    kind: filter.kind ?? [],
    bbox: filter.bbox ?? null,
    live: true,
    touches: false,
    payload: false,
  };
}

/** Degrees to at most six places, without a trailing exponent (the bbox pattern has none). */
function formatDegrees(value: number): string {
  return String(Number(value.toFixed(6)));
}

function sameWire(a: WireFilter | undefined, b: WireFilter | undefined): boolean {
  if (!a || !b) return a === b;
  return a.bbox === b.bbox && (a.kind ?? []).join(',') === (b.kind ?? []).join(',');
}

/** The `code` of a problem body, if it is one. */
function problemCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
    return body.code;
  }
  return undefined;
}

/**
 * A composite `Last-Event-ID` (`c=<seq>;a=<rev>;…`) with its `changes` cursor set to `seq`; the
 * other topics' cursors are kept.
 */
export function withChangesCursor(id: string | undefined, seq: number): string {
  const parts = (id ?? '').split(';').filter((part) => part !== '' && !part.startsWith('c='));
  return [`c=${seq}`, ...parts].join(';');
}

/** The page's visibility from `document`, when there is one. */
function documentVisibility(): VisibilitySource | undefined {
  if (typeof document === 'undefined') return undefined;
  return {
    hidden: () => document.visibilityState === 'hidden',
    subscribe(listener) {
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  };
}
