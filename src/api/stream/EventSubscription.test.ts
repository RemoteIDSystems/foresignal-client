import { FakeSse } from '../../alerts/testing/alertFixtures';
import type { TicketSource } from '../tickets';
import {
  EventSubscription,
  SUBSCRIPTION_BACKOFF_BASE_MS,
  SUBSCRIPTION_HEARTBEAT_MS,
  type EventSubscriptionOptions,
} from './EventSubscription';

/** A ticket source that mints numbered stream tickets. */
function tickets() {
  let minted = 0;
  const invalidate = vi.fn<() => void>();
  const source: TicketSource = {
    tileTicket: async () => null,
    streamTicket: async () => `fst_${++minted}`,
    invalidate,
  };
  return Object.assign(source, { invalidate });
}

function subscription(extra: Partial<EventSubscriptionOptions> = {}) {
  const sse = new FakeSse();
  const events: string[] = [];
  const states: string[] = [];
  const subscriber = new EventSubscription({
    baseUrl: 'http://api.test/',
    path: '/v1/alerts/stream',
    getToken: () => null,
    transport: sse.transport,
    random: () => 0.5,
    onEvent: (event) => events.push(`${event.event}:${event.data}`),
    onState: (state) => states.push(state),
    ...extra,
  });
  return { sse, events, states, subscriber };
}

describe('EventSubscription', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('connects without a ticket when there is no token, and hands on events but heartbeats', async () => {
    const { sse, events, states, subscriber } = subscription();
    subscriber.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sse.last.url.href).toBe('http://api.test/v1/alerts/stream');
    sse.open();
    sse.send('heartbeat', {});
    sse.send('alert', { n: 1 }, '7');
    expect(events).toEqual(['alert:{"n":1}']);
    expect(states).toEqual(['connecting', 'open']);
  });

  it('carries a fresh ticket and its headers, and resumes from the last event id', async () => {
    const source = tickets();
    const { sse, subscriber } = subscription({
      getToken: () => 'token',
      tickets: source,
      headers: () => ({ 'Foresignal-Device-Id': 'device-1' }),
    });
    subscriber.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sse.last.url.searchParams.get('ticket')).toBe('fst_1');
    expect(sse.last.headers).toEqual({ 'Foresignal-Device-Id': 'device-1' });
    sse.open();
    sse.send('alert', {}, '41');
    sse.fail({ status: 200 });
    // Backoff 1 s × (0.5 + 0.5).
    await vi.advanceTimersByTimeAsync(SUBSCRIPTION_BACKOFF_BASE_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(sse.connections).toHaveLength(2);
    expect(sse.last.url.searchParams.get('ticket')).toBe('fst_2');
    expect(sse.last.headers['Last-Event-ID']).toBe('41');
  });

  it('does not connect without a token when it needs one', async () => {
    const { sse, states, subscriber } = subscription({ requireToken: true });
    subscriber.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sse.connections).toHaveLength(0);
    expect(states).toEqual(['idle']);
  });

  it('forgets a cursor the server refuses, and drops the ticket after a 401', async () => {
    const source = tickets();
    const { sse, subscriber } = subscription({ getToken: () => 'token', tickets: source });
    subscriber.start();
    await vi.advanceTimersByTimeAsync(0);
    sse.open();
    sse.send('alert', {}, 'bad');
    sse.fail({ status: 400, body: { code: 'INVALID_CURSOR' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(sse.connections).toHaveLength(2);
    expect(sse.last.headers['Last-Event-ID']).toBeUndefined();
    sse.fail({ status: 401 });
    expect(source.invalidate).toHaveBeenCalled();
  });

  it('reconnects after a silent connection, and waits the server’s Retry-After', async () => {
    const { sse, states, subscriber } = subscription();
    subscriber.start();
    await vi.advanceTimersByTimeAsync(0);
    sse.open();
    await vi.advanceTimersByTimeAsync(SUBSCRIPTION_HEARTBEAT_MS);
    expect(sse.connections[0]!.closed).toBe(true);
    expect(states.at(-1)).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(SUBSCRIPTION_BACKOFF_BASE_MS);
    expect(sse.connections).toHaveLength(2);
    sse.fail({ status: 429, retryAfterMs: 10_000 });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(sse.connections).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sse.connections).toHaveLength(3);
  });

  it('stops for good until started again', async () => {
    const { sse, subscriber } = subscription();
    subscriber.start();
    await vi.advanceTimersByTimeAsync(0);
    subscriber.stop();
    expect(sse.last.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sse.connections).toHaveLength(1);
    expect(subscriber.current).toBe('stopped');
  });
});
