// @vitest-environment node
import { createForesignalClient } from '../../api/client';
import { http, MOCK_BASE_URL, server } from '../../api/testing/mock-server';
import { encodeTile } from './testing/encodeTile';
import { fetchTile, loadLayerTiles } from './tileSource';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** A client against the mock backend, retrying as the app does but without waiting. */
const api = () =>
  createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: { sleep: () => Promise.resolve() } });

/** A live-shaped TileJSON for one layer. */
const tileJson = (tiles: string[], extra: Record<string, unknown> = {}) => ({
  tilejson: '3.0.0' as const,
  name: 'aircraft',
  tiles,
  minzoom: 0,
  maxzoom: 16,
  bounds: [-180, -85.0511, 180, 85.0511],
  ...extra,
});

/** An MVT body as the backend serves it. */
const mvt = (body: Uint8Array) =>
  new Response(body.slice(), { headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile' } });

describe('loadLayerTiles', () => {
  it('reads the template, zoom range, bounds and aggregation zoom', async () => {
    server.use(
      http.get('/v1/tiles/{layer}.json', ({ params, response }) =>
        response(200).json(
          tileJson([`http://localhost:8080/v1/tiles/${params.layer}/{z}/{x}/{y}.mvt`], {
            'foresignal:aggBelowZoom': 7,
          }),
        ),
      ),
    );
    expect(await loadLayerTiles(api(), 'aircraft')).toEqual({
      ok: true,
      tiles: {
        template: { layer: 'aircraft', query: {} },
        minzoom: 0,
        maxzoom: 16,
        bounds: { west: -180, south: -85.0511, east: 180, north: 85.0511 },
        aggBelowZoom: 7,
      },
    });
  });

  it('refuses a template that names a time alias rather than an instant', async () => {
    server.use(
      http.get('/v1/tiles/{layer}.json', ({ response }) =>
        response(200).json(tileJson(['/v1/tiles/aircraft/{z}/{x}/{y}.mvt?asOf=latest'])),
      ),
    );
    expect(await loadLayerTiles(api(), 'aircraft')).toEqual({
      ok: false,
      message: 'The layer’s TileJSON has no record tile template.',
    });
  });

  it('retries a 429 per Retry-After, and reports a problem’s detail', async () => {
    let calls = 0;
    server.use(
      http.get('/v1/tiles/{layer}.json', ({ response }) => {
        calls++;
        if (calls === 1) {
          return response(429).json(
            { title: 'Rate limited', status: 429 },
            { headers: { 'Retry-After': '1', 'Content-Type': 'application/problem+json' } },
          );
        }
        return response(404).json(
          { title: 'Not found', status: 404, detail: 'No layer named aircraft.' },
          { headers: { 'Content-Type': 'application/problem+json' } },
        );
      }),
    );
    expect(await loadLayerTiles(api(), 'aircraft')).toEqual({
      ok: false,
      message: 'No layer named aircraft.',
      transient: false,
    });
    expect(calls).toBe(2);
  });
});

describe('fetchTile', () => {
  const template = { layer: 'aircraft', query: { asOf: '2026-10-19T00:00:00Z' } };
  const tile = { z: 1, x: 0, y: 0 };

  it('requests the tile as MVT with the template’s query, and decodes it', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/v1/tiles/{layer}/{z}/{x}/{y}.mvt', ({ request, response }) => {
        seen.push(`${new URL(request.url).pathname}${new URL(request.url).search}`);
        seen.push(request.headers.get('Accept') ?? '');
        return response.untyped(
          mvt(
            encodeTile([
              {
                name: 'aircraft',
                features: [
                  { type: 'point', geometry: [[[2048, 2048]]], properties: { kind: 'aircraft' } },
                ],
              },
            ]),
          ),
        );
      }),
    );
    const result = await fetchTile(api(), template, tile);
    expect(seen).toEqual([
      '/v1/tiles/aircraft/1/0/0.mvt?asOf=2026-10-19T00%3A00%3A00Z',
      'application/vnd.mapbox-vector-tile',
    ]);
    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.features).toEqual([
      {
        layer: 'aircraft',
        properties: { kind: 'aircraft' },
        geometry: { type: 'point', points: [[-90, expect.closeTo(66.513, 3)]] },
      },
    ]);
  });

  it('asks for hexagon cells or records when told, keeping the template’s query', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/v1/tiles/{layer}/{z}/{x}/{y}.mvt', ({ request, response }) => {
        seen.push(new URL(request.url).search);
        return response.untyped(mvt(new Uint8Array(0)));
      }),
    );
    await fetchTile(api(), template, tile, undefined, 'hex');
    await fetchTile(api(), template, tile, undefined, 'none');
    expect(seen).toEqual([
      '?asOf=2026-10-19T00%3A00%3A00Z&agg=hex',
      '?asOf=2026-10-19T00%3A00%3A00Z&agg=none',
    ]);
  });

  it('retries a 429 per Retry-After, then draws the tile', async () => {
    let calls = 0;
    server.use(
      http.get('/v1/tiles/{layer}/{z}/{x}/{y}.mvt', ({ response }) => {
        calls++;
        if (calls === 1) {
          return response(429).json(
            { title: 'Rate limited', status: 429 },
            { headers: { 'Retry-After': '2', 'Content-Type': 'application/problem+json' } },
          );
        }
        return response.untyped(mvt(new Uint8Array(0)));
      }),
    );
    expect(await fetchTile(api(), template, tile)).toEqual({ status: 'ok', features: [] });
    expect(calls).toBe(2);
  });

  it('tells a missing layer from a failed tile', async () => {
    server.use(
      http.get('/v1/tiles/{layer}/{z}/{x}/{y}.mvt', ({ params, response }) =>
        params.layer === 'gone'
          ? response(404).json(
              { title: 'Not found', status: 404 },
              { headers: { 'Content-Type': 'application/problem+json' } },
            )
          : response(400).json(
              { title: 'Bad request', status: 400, detail: 'Zoom out of range.' },
              { headers: { 'Content-Type': 'application/problem+json' } },
            ),
      ),
    );
    expect(await fetchTile(api(), { layer: 'gone', query: {} }, tile)).toEqual({
      status: 'missing',
      message: 'The layer is not on the server.',
    });
    expect(await fetchTile(api(), template, tile)).toEqual({
      status: 'failed',
      message: 'Zoom out of range.',
      transient: false,
    });
  });

  it('throws when its request is canceled', async () => {
    server.use(
      http.get('/v1/tiles/{layer}/{z}/{x}/{y}.mvt', ({ response }) =>
        response.untyped(mvt(new Uint8Array(0))),
      ),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(fetchTile(api(), template, tile, controller.signal)).rejects.toThrow();
  });
});
