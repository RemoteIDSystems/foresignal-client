import { createForesignalClient } from './client';
import { createTicketSource, withTicket } from './tickets';
import { http, MOCK_BASE_URL, server } from './testing/mock-server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Serves createStreamTicket, numbering tickets and recording each request body. */
function ticketServer(expiresAt: string) {
  const bodies: unknown[] = [];
  server.use(
    http.post('/v1/stream-tickets', async ({ request, response }) => {
      const body = await request.json();
      bodies.push(body);
      return response(201).json({
        ticket: `fst_${bodies.length}`,
        purpose: body.purpose,
        expiresAt,
      });
    }),
  );
  return bodies;
}

function source(token: () => string | null, now = () => Date.parse('2026-10-19T12:00:00Z')) {
  const client = createForesignalClient({ baseUrl: MOCK_BASE_URL, getToken: token });
  return createTicketSource(client, { getToken: token, now, tileTtl: '10m' });
}

describe('createTicketSource', () => {
  it('returns null and calls nothing without a token (open reads)', async () => {
    const bodies = ticketServer('2026-10-19T12:10:00Z');
    const tickets = source(() => null);
    expect(await tickets.tileTicket()).toBeNull();
    expect(await tickets.streamTicket()).toBeNull();
    expect(bodies).toHaveLength(0);
  });

  it('mints a tile ticket once and reuses it within its lifetime', async () => {
    const bodies = ticketServer('2026-10-19T12:10:00Z');
    const tickets = source(() => 'fsr_a');
    expect(await tickets.tileTicket()).toBe('fst_1');
    expect(await tickets.tileTicket()).toBe('fst_1');
    expect(bodies).toEqual([{ purpose: 'tiles', ttl: '10m' }]);
  });

  it('shares one mint between concurrent callers', async () => {
    const bodies = ticketServer('2026-10-19T12:10:00Z');
    const tickets = source(() => 'fsr_a');
    const [a, b] = await Promise.all([tickets.tileTicket(), tickets.tileTicket()]);
    expect([a, b]).toEqual(['fst_1', 'fst_1']);
    expect(bodies).toHaveLength(1);
  });

  it('mints again near expiry, after invalidate, and when the token changes', async () => {
    const bodies = ticketServer('2026-10-19T12:00:20Z');
    let token = 'fsr_a';
    const tickets = source(() => token);
    expect(await tickets.tileTicket()).toBe('fst_1');
    expect(await tickets.tileTicket()).toBe('fst_2');
    tickets.invalidate();
    expect(await tickets.tileTicket()).toBe('fst_3');
    token = 'fsr_b';
    expect(await tickets.tileTicket()).toBe('fst_4');
    expect(bodies).toHaveLength(4);
  });

  it('mints a fresh stream ticket for every connection', async () => {
    const bodies = ticketServer('2026-10-19T12:01:00Z');
    const tickets = source(() => 'fsr_a');
    expect(await tickets.streamTicket()).toBe('fst_1');
    expect(await tickets.streamTicket()).toBe('fst_2');
    expect(bodies).toEqual([{ purpose: 'stream' }, { purpose: 'stream' }]);
  });
});

describe('withTicket', () => {
  it('adds the ticket as a query parameter', () => {
    expect(withTicket('/v1/events/stream', 'fst_x')).toBe('/v1/events/stream?ticket=fst_x');
    expect(withTicket('http://h/v1/tiles/a/1/2/3.mvt?agg=hex', 'fst_x')).toBe(
      'http://h/v1/tiles/a/1/2/3.mvt?agg=hex&ticket=fst_x',
    );
  });

  it('keeps a fragment last and encodes the ticket', () => {
    expect(withTicket('/v1/a#f', 'fst_a+b')).toBe('/v1/a?ticket=fst_a%2Bb#f');
  });

  it('returns the URL unchanged without a ticket', () => {
    expect(withTicket('/v1/a', null)).toBe('/v1/a');
  });
});
