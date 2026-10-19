import { createForesignalClient } from './client';
import { keyed, mintTileKey } from './tileKey';
import { http, MOCK_BASE_URL, server } from './testing/mock-server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('keyed', () => {
  it('rewrites relative and absolute /v1/ URLs', () => {
    expect(keyed('/v1/tiles/a/1/2/3.mvt', 'fsk_k')).toBe('/v1/k/fsk_k/tiles/a/1/2/3.mvt');
    expect(keyed('https://fs.example/v1/products/p/tilejson?x=1', 'fsk_k')).toBe(
      'https://fs.example/v1/k/fsk_k/products/p/tilejson?x=1',
    );
    expect(keyed('//fs.example/v1/map/style.json', 'fsk_k')).toBe(
      '//fs.example/v1/k/fsk_k/map/style.json',
    );
  });

  it('leaves keyed and non-API URLs unchanged', () => {
    expect(keyed('/v1/k/fsk_k/tiles/a.json', 'fsk_other')).toBe('/v1/k/fsk_k/tiles/a.json');
    expect(keyed('/assets/app.js', 'fsk_k')).toBe('/assets/app.js');
    expect(keyed('https://fs.example/other/v1/x', 'fsk_k')).toBe('https://fs.example/other/v1/x');
  });
});

describe('mintTileKey', () => {
  it('posts createTileKey and returns the key and urlBase', async () => {
    let body: unknown;
    server.use(
      http.post('/v1/tile-keys', async ({ request, response }) => {
        body = await request.json();
        return response(201).json({
          id: '00000000-0000-4000-8000-000000000001',
          name: 'map',
          keyPrefix: 'fsk_abcd',
          prefixes: ['/v1/tiles/'],
          createdAt: '2026-10-19T00:00:00Z',
          expiresAt: '2026-10-26T00:00:00Z',
          key: 'fsk_abcdefgh',
          urlBase: 'http://backend.test/v1/k/fsk_abcdefgh',
        });
      }),
    );
    const client = createForesignalClient({ baseUrl: MOCK_BASE_URL, getToken: () => 'fsr_a' });
    const key = await mintTileKey(client, { name: 'map', prefixes: ['/v1/tiles/'], ttl: '7d' });
    expect(body).toEqual({ name: 'map', prefixes: ['/v1/tiles/'], ttl: '7d' });
    expect(key.key).toBe('fsk_abcdefgh');
    expect(keyed('/v1/tiles/a.json', key.key)).toBe('/v1/k/fsk_abcdefgh/tiles/a.json');
  });
});
