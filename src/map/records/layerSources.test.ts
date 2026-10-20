// @vitest-environment node
import { createForesignalClient } from '../../api/client';
import { http, MOCK_BASE_URL, server } from '../../api/testing/mock-server';
import { LayerSources, MAX_TILE_REQUESTS, TILE_CACHE_MS } from './layerSources';
import { encodeTile } from './testing/encodeTile';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** A client against the mock backend that does not retry. */
const api = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

/** A tile with one earthquake in it. */
const quake = encodeTile([
  {
    name: 'earthquake',
    features: [{ type: 'point', geometry: [[[2048, 2048]]], properties: { externalId: 'q1' } }],
  },
]);

const template = { layer: 'earthquake', query: {} };

describe('LayerSources', () => {
  it('reads a layer’s TileJSON once, and asks again for a failed one after a while', async () => {
    let reads = 0;
    let fail = true;
    server.use(
      http.get('/v1/tiles/{layer}.json', ({ response }) => {
        reads++;
        if (fail)
          return response(404).json({ type: 'about:blank', title: 'Not found', status: 404 });
        return response(200).json({
          tilejson: '3.0.0',
          tiles: ['/v1/tiles/earthquake/{z}/{x}/{y}.mvt'],
        });
      }),
    );
    let now = 0;
    const sources = new LayerSources(api(), () => now);
    expect((await sources.layerTiles('earthquake')).ok).toBe(false);
    expect((await sources.layerTiles('earthquake')).ok).toBe(false);
    expect(reads).toBe(1);
    fail = false;
    now = 31_000;
    expect((await sources.layerTiles('earthquake')).ok).toBe(true);
    now = 100_000;
    expect((await sources.layerTiles('earthquake')).ok).toBe(true);
    expect(reads).toBe(2);
  });

  it('reads a rate-limited TileJSON again on the next ask, and marks a tile so limited transient', async () => {
    let reads = 0;
    server.use(
      http.get('/v1/tiles/{layer}.json', ({ response }) => {
        reads++;
        if (reads === 1) {
          return response.untyped(
            new Response(JSON.stringify({ code: 'RATE_LIMITED', detail: 'Too many' }), {
              status: 429,
              headers: { 'Content-Type': 'application/problem+json' },
            }),
          );
        }
        return response(200).json({
          tilejson: '3.0.0',
          tiles: ['/v1/tiles/earthquake/{z}/{x}/{y}.mvt'],
        });
      }),
      http.get('/v1/tiles/{layer}/{z}/{x}/{y}.mvt', ({ response }) =>
        response.untyped(new Response(null, { status: 503 })),
      ),
    );
    const sources = new LayerSources(api());
    expect(await sources.layerTiles('earthquake')).toEqual({
      ok: false,
      message: 'Too many',
      transient: true,
    });
    expect((await sources.layerTiles('earthquake')).ok).toBe(true);
    expect(reads).toBe(2);
    expect(
      await sources.tile(template, { z: 0, x: 0, y: 0 }, new AbortController().signal),
    ).toMatchObject({ status: 'failed', transient: true });
  });

  it('reuses a decoded tile while it is fresh, then fetches it again', async () => {
    let fetches = 0;
    server.use(
      http.get('/v1/tiles/{layer}/{z}/{x}/{y}.mvt', ({ response }) => {
        fetches++;
        return response.untyped(new Response(quake.slice()));
      }),
    );
    let now = 0;
    const sources = new LayerSources(api(), () => now);
    const tile = { z: 0, x: 0, y: 0 };
    const signal = new AbortController().signal;
    const first = await sources.tile(template, tile, signal);
    expect(first).toMatchObject({ status: 'ok', features: [{ layer: 'earthquake' }] });
    await sources.tile(template, tile, signal);
    // An aggregate tile of the same place is another tile.
    await sources.tile(template, tile, signal, 'hex');
    expect(fetches).toBe(2);
    now = TILE_CACHE_MS + 1;
    await sources.tile(template, tile, signal);
    expect(fetches).toBe(3);
  });

  it('keeps at most the shared number of requests in flight, and drops aborted waiters', async () => {
    const release: (() => void)[] = [];
    let started = 0;
    server.use(
      http.get('/v1/tiles/{layer}/{z}/{x}/{y}.mvt', async ({ response }) => {
        started++;
        await new Promise<void>((resolve) => release.push(resolve));
        return response.untyped(new Response(new Uint8Array(0)));
      }),
    );
    const sources = new LayerSources(api());
    const aborted = new AbortController();
    const loads = Array.from({ length: MAX_TILE_REQUESTS + 3 }, (_, x) =>
      sources.tile(
        template,
        { z: 5, x, y: 0 },
        x === MAX_TILE_REQUESTS ? aborted.signal : new AbortController().signal,
      ),
    );
    await vi.waitFor(() => expect(started).toBe(MAX_TILE_REQUESTS));
    expect(sources.queued).toEqual({ waiting: 3, active: MAX_TILE_REQUESTS });
    aborted.abort();
    await expect(loads[MAX_TILE_REQUESTS]).rejects.toBeDefined();
    expect(sources.queued.waiting).toBe(2);
    release.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(started).toBe(MAX_TILE_REQUESTS + 2));
    release.splice(0).forEach((resolve) => resolve());
    const results = await Promise.allSettled(loads);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(MAX_TILE_REQUESTS + 2);
    expect(sources.queued).toEqual({ waiting: 0, active: 0 });
  });
});
