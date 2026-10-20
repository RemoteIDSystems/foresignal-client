// @vitest-environment node
import { createForesignalClient } from '../../api/client';
import { http, MOCK_BASE_URL, server } from '../../api/testing/mock-server';
import {
  fetchProductTile,
  liveFrames,
  loadLoop,
  loadProducts,
  parseFieldPngUrl,
  parseProductImageUrl,
  parseProductTileTemplate,
  pollInterval,
  type LoopFrame,
  type Product,
} from './productApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** A client against the mock backend, retrying as the app does but without waiting. */
const api = () =>
  createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: { sleep: () => Promise.resolve() } });

describe('parseProductTileTemplate', () => {
  it('reads a frame’s concrete template, whatever its host', () => {
    expect(
      parseProductTileTemplate(
        'https://fs.example/v1/products/mrms-reflectivity/tiles/20261010T143240Z~1a2b3c4d/{z}/{x}/{y}.png?style=nws-reflectivity@1',
      ),
    ).toEqual({
      productId: 'mrms-reflectivity',
      frameKey: '20261010T143240Z~1a2b3c4d',
      query: { style: 'nws-reflectivity@1' },
    });
    expect(
      parseProductTileTemplate(
        '/v1/products/gfs/tiles/20261010T120000Z~00ff00ff/{z}/{x}/{y}.png?style=wind-speed@1&run=2026-10-10T12:00:00Z',
      )?.query,
    ).toEqual({ style: 'wind-speed@1', run: '2026-10-10T12:00:00Z' });
  });

  it('refuses an alias frame and any other shape', () => {
    expect(parseProductTileTemplate('/v1/products/gfs/tiles/latest/{z}/{x}/{y}.png')).toBe(
      undefined,
    );
    expect(parseProductTileTemplate('/v1/products/gfs/tiles/NOW/{z}/{x}/{y}.png')).toBe(undefined);
    expect(parseProductTileTemplate('/v1/tiles/earthquake/{z}/{x}/{y}.mvt')).toBe(undefined);
  });
});

describe('parseProductImageUrl and parseFieldPngUrl', () => {
  it('read a loop frame’s image and a manifest’s png-uv into their operations', () => {
    expect(
      parseProductImageUrl(
        'http://x/v1/products/mrms-reflectivity/image/20261010T143240Z~1a2b3c4d.png?bbox=-90,20,-60,40&width=512&height=380&crs=EPSG:3857',
      ),
    ).toEqual({
      productId: 'mrms-reflectivity',
      frameKey: '20261010T143240Z~1a2b3c4d',
      format: 'png',
      query: { bbox: '-90,20,-60,40', width: 512, height: 380, crs: 'EPSG:3857' },
    });
    expect(parseProductImageUrl('/v1/products/a/image/latest.png?bbox=0,0,1,1')).toBe(undefined);
    expect(parseProductImageUrl('/v1/products/a/image/k~1.png')).toBe(undefined);
    expect(
      parseFieldPngUrl('/v1/products/gfs/fields/20261010T120000Z~00ff00ff.png-uv?run=r&res=1'),
    ).toEqual({
      productId: 'gfs',
      frameKey: '20261010T120000Z~00ff00ff',
      query: { run: 'r', res: 1 },
    });
  });
});

describe('pollInterval and liveFrames', () => {
  it('polls at half the cadence, at most a minute', () => {
    expect(pollInterval('2m')).toBe(60_000);
    expect(pollInterval('1m')).toBe(30_000);
    expect(pollInterval('20s')).toBe(10_000);
    expect(pollInterval('1d')).toBe(60_000);
    expect(pollInterval(null)).toBe(60_000);
  });

  it('drops frames past their expiry', () => {
    const frame = (expiresAt: string | null) =>
      ({
        productId: 'p',
        time: 't',
        frameKey: 'k',
        kind: 'observed',
        url: 'u',
        expiresAt,
      }) as LoopFrame;
    const now = Date.parse('2026-10-20T12:00:00Z');
    const frames = [frame('2026-10-20T11:59:00Z'), frame('2026-10-20T12:01:00Z'), frame(null)];
    expect(liveFrames(frames, now)).toEqual(frames.slice(1));
  });
});

describe('loadProducts', () => {
  it('reads every page', async () => {
    const product = (id: string) => ({
      id,
      title: id,
      kind: 'raster',
      category: 'radar',
      source: 's',
    });
    server.use(
      http.get('/v1/products', ({ query, response }) =>
        response(200).json(
          query.get('cursor') === 'two'
            ? { items: [product('b') as Product] }
            : { items: [product('a') as Product], nextCursor: 'two' },
        ),
      ),
    );
    expect((await loadProducts(api())).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('loadLoop', () => {
  it('asks for the viewport, the frame limit and a width the backend allows', async () => {
    const asked: string[] = [];
    server.use(
      http.get('/v1/products/loop', ({ request, response }) => {
        asked.push(new URL(request.url).search);
        return response(200).json({
          crs: 'EPSG:3857',
          bounds: [0, 0, 1, 1],
          coordinates: [],
          width: 1,
          height: 1,
          frames: [],
          serverTime: '2026-10-20T12:00:00Z',
        });
      }),
    );
    await loadLoop(api(), 'mrms-reflectivity', { bbox: [-90, 20, -60, 40], zoom: 4 }, 1800);
    await loadLoop(api(), 'mrms-reflectivity', { bbox: [170, -10, -170, 10], zoom: 4 }, 30);
    const params = asked.map((search) => Object.fromEntries(new URLSearchParams(search)));
    expect(params[0]).toEqual({
      products: 'mrms-reflectivity',
      bbox: '-90,20,-60,40',
      frames: '24',
      width: '1024',
    });
    // Across the antimeridian, up to it; never narrower than the backend's minimum.
    expect(params[1]).toMatchObject({ bbox: '170,-10,180,10', width: '64' });
  });
});

describe('fetchProductTile', () => {
  it('fetches the tile through the client and retries a busy renderer', async () => {
    let calls = 0;
    const seen: string[] = [];
    server.use(
      http.get(
        '/v1/products/{productId}/tiles/{frameKey}/{z}/{x}/{y}.png',
        ({ request, response }) => {
          calls++;
          seen.push(new URL(request.url).pathname + new URL(request.url).search);
          if (calls === 1) {
            return response.untyped(
              new Response(JSON.stringify({ code: 'RENDER_BUSY' }), {
                status: 503,
                headers: { 'Retry-After': '1', 'Content-Type': 'application/problem+json' },
              }),
            );
          }
          return response.untyped(
            new Response(new Uint8Array([137, 80, 78, 71]), {
              headers: { 'Content-Type': 'image/png' },
            }),
          );
        },
      ),
    );
    const blob = await fetchProductTile(
      api(),
      { productId: 'gfs', frameKey: '20261010T120000Z~00ff00ff', query: { style: 'wind-speed@1' } },
      { z: 3, x: 2, y: 3 },
    );
    expect(blob.size).toBe(4);
    expect(calls).toBe(2);
    expect(seen[1]).toBe(
      '/v1/products/gfs/tiles/20261010T120000Z~00ff00ff/3/2/3.png?style=wind-speed%401',
    );
  });
});
