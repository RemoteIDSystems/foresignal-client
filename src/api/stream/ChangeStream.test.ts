import { createForesignalClient } from '../client';
import type { TicketSource } from '../tickets';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  ChangeStream,
  FILTER_DEBOUNCE_MS,
  HEARTBEAT_TIMEOUT_MS,
  HIDDEN_GRACE_MS,
  MAX_FILTER_KINDS,
  RELEASE_GRACE_MS,
  withChangesCursor,
  type Change,
  type ResyncReason,
  type VisibilitySource,
} from './ChangeStream';
import type { SseFailure, SseHandlers, SseTransport } from './sse';

/** One connection the fake transport was asked to open. */
interface FakeConnection {
  url: URL;
  headers: Record<string, string>;
  handlers: SseHandlers;
  closed: boolean;
}

/** An event source the test drives: it records connections and plays events into them. */
class FakeEventSource {
  readonly connections: FakeConnection[] = [];
  readonly transport: SseTransport = ({ url, headers }, handlers) => {
    const connection = { url: new URL(url, 'http://app.test'), headers, handlers, closed: false };
    this.connections.push(connection);
    return () => {
      connection.closed = true;
    };
  };

  get last(): FakeConnection {
    return this.connections.at(-1)!;
  }

  /** Opens the last connection and sends its `hello`. */
  hello(streamId = 'S'.repeat(22), watermarkSeq = 100, filterVersion = 1): void {
    this.last.handlers.onOpen();
    this.send('hello', {
      streamId,
      topics: ['changes'],
      watermarkSeq,
      filterVersion,
      streamKey: 'K',
    });
  }

  send(event: string, data: unknown, id?: string): void {
    this.last.handlers.onActivity();
    this.last.handlers.onEvent({ event, data: JSON.stringify(data), id });
  }

  change(seq: number): void {
    this.send('change', change(seq), `c=${seq}`);
  }

  fail(failure: SseFailure = {}): void {
    this.last.handlers.onClose(failure);
  }
}

function change(seq: number): Change {
  return {
    seq,
    source: 'usgs-earthquakes',
    externalId: `q${seq}`,
    kind: 'earthquake',
    version: 1,
    observedAt: '2026-10-20T12:00:00Z',
    tombstone: false,
    leftFilter: false,
    bbox: [-120, 35, -120, 35],
  };
}

/** A backend for `listChanges` and the filter PATCH, recording what was asked. */
function fakeBackend() {
  const requests: { method: string; url: URL; headers: Headers; body?: unknown }[] = [];
  let changes: (url: URL) => Response = () =>
    Response.json({ items: [], lastSeq: 0, hasMore: false });
  let patch: () => Response = () => Response.json({});
  const api = createForesignalClient({
    baseUrl: 'http://api.test',
    retry: false,
    fetch: async (request) => {
      const url = new URL(request.url);
      const body = request.method === 'PATCH' ? await request.json() : undefined;
      requests.push({ method: request.method, url, headers: request.headers, body });
      if (url.pathname === '/v1/changes') return changes(url);
      if (url.pathname.endsWith('/filter')) return patch();
      return new Response(null, { status: 404 });
    },
  });
  return {
    api,
    requests,
    onChanges(handler: (url: URL) => Response) {
      changes = handler;
    },
    onPatch(handler: () => Response) {
      patch = handler;
    },
  };
}

/** A page whose visibility the test sets. */
function fakeVisibility() {
  let hidden = false;
  const listeners = new Set<() => void>();
  const source: VisibilitySource = {
    hidden: () => hidden,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    set(next: boolean) {
      hidden = next;
      for (const listener of listeners) listener();
    },
  };
}

function setup(options: { token?: string; tickets?: TicketSource } = {}) {
  const events = new FakeEventSource();
  const backend = fakeBackend();
  const visibility = fakeVisibility();
  const stream = new ChangeStream({
    api: backend.api,
    baseUrl: '/',
    getToken: () => options.token ?? null,
    tickets: options.tickets,
    transport: events.transport,
    visibility: visibility.source,
    random: () => 0.5,
  });
  const received: { seq: number; origin: string }[] = [];
  const resyncs: ResyncReason[] = [];
  stream.listen({
    changes: (changes, origin) => received.push(...changes.map((c) => ({ seq: c.seq, origin }))),
    resync: (reason) => resyncs.push(reason),
  });
  return { stream, events, backend, visibility, received, resyncs };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ChangeStream', () => {
  it('opens one stream of the changes topic, narrowed to the filter, and goes live on hello', async () => {
    const { stream, events } = setup();
    stream.setFilter({ kinds: ['vessel', 'earthquake'], bbox: [-130, 20, -60, 55] });
    stream.start();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(events.connections).toHaveLength(1);
    const { url, headers } = events.last;
    expect(url.pathname).toBe('/v1/events/stream');
    expect(url.searchParams.get('topics')).toBe('changes');
    expect(url.searchParams.get('changes.kind')).toBe('earthquake,vessel');
    expect(url.searchParams.get('changes.bbox')).toBe('-130,20,-60,55');
    expect(headers['Last-Event-ID']).toBeUndefined();
    expect(stream.getStatus().state).toBe('connecting');
    events.hello();
    expect(stream.getStatus()).toMatchObject({ state: 'live', filterVersion: 1, lastSeq: 100 });
  });

  it('hands on each change once, in seq order', async () => {
    const { stream, events, received } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    events.change(101);
    events.change(102);
    events.change(102);
    events.change(101);
    expect(received.map((r) => r.seq)).toEqual([101, 102]);
    expect(stream.getStatus().lastSeq).toBe(102);
  });

  it('reconnects when heartbeats stop, catches up with listChanges and resumes with Last-Event-ID, losing nothing', async () => {
    const { stream, events, backend, received } = setup();
    stream.setFilter({ kinds: ['earthquake'] });
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    events.change(101);
    events.send('heartbeat', {});
    // Silence: the link is taken for dead after the timeout, and retried after the first backoff.
    backend.onChanges((url) => {
      expect(url.searchParams.get('after')).toBe('101');
      expect(url.searchParams.getAll('kind')).toEqual(['earthquake']);
      return Response.json({ items: [change(102), change(103)], lastSeq: 103, hasMore: false });
    });
    await vi.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS);
    expect(events.connections[0]!.closed).toBe(true);
    expect(stream.getStatus()).toMatchObject({ state: 'reconnecting', attempt: 1 });
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(events.connections).toHaveLength(2);
    expect(events.last.headers['Last-Event-ID']).toBe('c=103');
    // The server replays from the cursor; anything already caught up is not handed on twice.
    events.hello('T'.repeat(22), 104);
    events.change(103);
    events.change(104);
    expect(received).toEqual([
      { seq: 101, origin: 'stream' },
      { seq: 102, origin: 'catch-up' },
      { seq: 103, origin: 'catch-up' },
      { seq: 104, origin: 'stream' },
    ]);
    expect(stream.getStatus()).toMatchObject({ state: 'live', attempt: 0, connections: 2 });
  });

  it('backs off exponentially with jitter up to the maximum, and resets after a good connection', async () => {
    const { stream, events } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      const before = Date.now();
      events.fail({ cause: new TypeError('network') });
      waits.push(stream.getStatus().retryAt! - before);
      await vi.advanceTimersByTimeAsync(stream.getStatus().retryAt! - Date.now());
    }
    // random() = 0.5 makes the jitter factor exactly 1.
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, BACKOFF_MAX_MS, BACKOFF_MAX_MS]);
    events.hello();
    events.fail({ status: 200 });
    expect(stream.getStatus().retryAt! - Date.now()).toBe(BACKOFF_BASE_MS);
    expect(stream.getStatus().error).toBe('The server closed the stream.');
  });

  it("waits the server's Retry-After when it refuses the stream", async () => {
    const { stream, events } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.fail({ status: 429, retryAfterMs: 7_000, body: { code: 'STREAM_LIMIT' } });
    expect(stream.getStatus().error).toContain('HTTP 429 STREAM_LIMIT');
    await vi.advanceTimersByTimeAsync(6_999);
    expect(events.connections).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(events.connections).toHaveLength(2);
  });

  it('reloads the layers and starts afresh on 410 RESYNC_REQUIRED from the stream', async () => {
    const { stream, events, resyncs } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    events.change(150);
    events.fail({ status: 410, body: { code: 'RESYNC_REQUIRED' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(resyncs).toEqual(['resync_required']);
    expect(events.connections).toHaveLength(2);
    expect(events.last.headers['Last-Event-ID']).toBeUndefined();
  });

  it('reloads the layers when catching up finds the gap purged (410 from listChanges)', async () => {
    const { stream, events, backend, resyncs } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    backend.onChanges(() =>
      Response.json({ code: 'RESYNC_REQUIRED', status: 410, title: 'Gone' }, { status: 410 }),
    );
    events.fail({ cause: new TypeError('network') });
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(resyncs).toEqual(['resync_required']);
    expect(events.connections).toHaveLength(2);
    expect(events.last.headers['Last-Event-ID']).toBeUndefined();
  });

  it('reloads instead of catching up when the gap is longer than the catch-up reads', async () => {
    const { stream, events, backend, resyncs, received } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    let next = 101;
    backend.onChanges(() => {
      const items = [change(next)];
      return Response.json({ items, lastSeq: next++, hasMore: true });
    });
    events.fail({});
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(received).toHaveLength(10);
    expect(resyncs).toEqual(['catch_up_cap']);
    expect(events.last.headers['Last-Event-ID']).toBeUndefined();
  });

  it('follows a reset: resumes after resumeAfter, or resyncs when told to', async () => {
    const { stream, events, resyncs } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    events.change(120);
    events.send('reset', { reason: 'buffer_overflow', resumeAfter: 118, watermarkSeq: 130 });
    await vi.advanceTimersByTimeAsync(0);
    expect(events.connections[0]!.closed).toBe(true);
    expect(events.last.headers['Last-Event-ID']).toBe('c=118');
    events.hello();
    events.send('reset', { reason: 'resync_required', resumeAfter: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(resyncs).toEqual(['resync_required']);
    expect(events.connections).toHaveLength(3);
    expect(events.last.headers['Last-Event-ID']).toBeUndefined();
  });

  it('passes a resync event on and keeps the stream open', async () => {
    const { stream, events, resyncs } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    events.send('resync', { reason: 'live_dropped', watermarkSeq: 140 });
    expect(resyncs).toEqual(['live_dropped']);
    expect(events.last.closed).toBe(false);
  });

  it('re-filters the open stream once per burst of changes, and counts it done on filter-applied', async () => {
    const { stream, events, backend } = setup();
    stream.setFilter({ kinds: ['earthquake'] });
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello('A'.repeat(22));
    await vi.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS);
    expect(backend.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);

    stream.setFilter({ kinds: ['earthquake', 'vessel'] });
    stream.setFilter({ kinds: ['earthquake', 'vessel'], bbox: [10, 40, 20, 50] });
    expect(stream.getStatus().filterPending).toBe(true);
    await vi.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS);
    const patches = backend.requests.filter((r) => r.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0]!.url.pathname).toBe(`/v1/events/stream/${'A'.repeat(22)}/filter`);
    expect(patches[0]!.headers.get('Foresignal-Stream-Key')).toBe('K');
    expect(patches[0]!.body).toEqual({
      changes: {
        kind: ['earthquake', 'vessel'],
        bbox: '10,40,20,50',
        live: true,
        touches: false,
        payload: false,
      },
    });
    expect(stream.getStatus().filterPending).toBe(true);
    events.send('filter-applied', { atSeq: 100, filterVersion: 2 });
    expect(stream.getStatus()).toMatchObject({
      filterPending: false,
      filterVersion: 2,
      filterAppliedAtSeq: 100,
    });
    expect(events.connections).toHaveLength(1);
  });

  it('opens a new stream with the filter when the old one is gone (404 on the PATCH)', async () => {
    const { stream, events, backend } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    backend.onPatch(() => Response.json({ code: 'NOT_FOUND' }, { status: 404 }));
    stream.setFilter({ kinds: ['vessel'] });
    await vi.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS);
    expect(events.connections).toHaveLength(2);
    expect(events.last.url.searchParams.get('changes.kind')).toBe('vessel');
  });

  it('does not filter by kind past the spec’s limit of kinds, and sends no box for the whole world', async () => {
    const { stream, events } = setup();
    const kinds = Array.from({ length: MAX_FILTER_KINDS + 1 }, (_, i) => `k${i}`);
    stream.setFilter({ kinds, bbox: [-180, -90, 180, 90] });
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(events.last.url.searchParams.has('changes.kind')).toBe(false);
    expect(events.last.url.searchParams.has('changes.bbox')).toBe(false);
  });

  it('carries a fresh stream ticket on every connection when there is a token', async () => {
    let minted = 0;
    const tickets: TicketSource = {
      tileTicket: () => Promise.resolve(null),
      streamTicket: () => Promise.resolve(`fst_${++minted}`),
      invalidate: vi.fn(),
    };
    const { stream, events } = setup({ token: 'fs_token', tickets });
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(events.last.url.searchParams.get('ticket')).toBe('fst_1');
    events.fail({ status: 401 });
    expect(tickets.invalidate).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(events.last.url.searchParams.get('ticket')).toBe('fst_2');
  });

  it('sends no ticket without a token (open reads)', async () => {
    const tickets: TicketSource = {
      tileTicket: () => Promise.resolve(null),
      streamTicket: vi.fn(() => Promise.resolve('fst_x')),
      invalidate: vi.fn(),
    };
    const { stream, events } = setup({ tickets });
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(events.last.url.searchParams.has('ticket')).toBe(false);
    expect(tickets.streamTicket).not.toHaveBeenCalled();
  });

  it('closes while the page is hidden for long, and catches up when it shows again', async () => {
    const { stream, events, backend, visibility, received } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    events.change(101);
    /** Lets `ms` pass with the server's heartbeats every 15 s, as a live connection has them. */
    const pass = async (ms: number) => {
      for (let left = ms; left > 0; left -= 15_000) {
        await vi.advanceTimersByTimeAsync(Math.min(15_000, left));
        if (!events.last.closed) events.send('heartbeat', {});
      }
    };
    visibility.set(true);
    // A short switch away keeps the stream.
    await pass(HIDDEN_GRACE_MS / 2);
    visibility.set(false);
    visibility.set(true);
    await pass(HIDDEN_GRACE_MS - 1);
    expect(stream.getStatus().state).toBe('live');
    await vi.advanceTimersByTimeAsync(1);
    expect(stream.getStatus().state).toBe('paused');
    expect(events.last.closed).toBe(true);
    backend.onChanges(() => Response.json({ items: [change(102)], lastSeq: 102, hasMore: false }));
    visibility.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(received.map((r) => r.seq)).toEqual([101, 102]);
    expect(events.connections).toHaveLength(2);
    expect(events.last.headers['Last-Event-ID']).toBe('c=102');
  });

  it('is shared: the first holder opens it and the last release closes it, after a grace', async () => {
    const { stream, events } = setup();
    const releaseA = stream.retain();
    const releaseB = stream.retain();
    await vi.advanceTimersByTimeAsync(0);
    expect(events.connections).toHaveLength(1);
    releaseA();
    releaseA();
    expect(events.last.closed).toBe(false);
    releaseB();
    // Held again at once (a view mounted again): the same connection stays.
    const releaseC = stream.retain();
    await vi.advanceTimersByTimeAsync(RELEASE_GRACE_MS);
    expect(events.connections).toHaveLength(1);
    expect(events.last.closed).toBe(false);
    releaseC();
    await vi.advanceTimersByTimeAsync(RELEASE_GRACE_MS - 1);
    expect(events.last.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(events.last.closed).toBe(true);
    expect(stream.getStatus().state).toBe('idle');
  });

  it('can be made to reconnect at once, resuming from the last change', async () => {
    const { stream, events } = setup();
    stream.start();
    await vi.advanceTimersByTimeAsync(0);
    events.hello();
    events.change(107);
    stream.reconnectNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(events.connections).toHaveLength(2);
    expect(events.last.headers['Last-Event-ID']).toBe('c=107');
  });
});

describe('withChangesCursor', () => {
  it('sets the changes cursor and keeps the other topics', () => {
    expect(withChangesCursor(undefined, 5)).toBe('c=5');
    expect(withChangesCursor('c=3;a=56;n=7', 9)).toBe('c=9;a=56;n=7');
    expect(withChangesCursor('a=1', 2)).toBe('c=2;a=1');
  });
});
