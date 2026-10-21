// @vitest-environment node
import { createForesignalClient } from '../../api/client';
import { http, MOCK_BASE_URL, server } from '../../api/testing/mock-server';
import { parseTileTemplate } from './tileTemplate';
import { fetchTile, loadLayerTiles } from './tileSource';
import { viewIdOf, viewLayerId } from './viewLayers';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = () =>
  createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: { sleep: () => Promise.resolve() } });

describe('saved view layers', () => {
  it('names a view layer and reads it back', () => {
    expect(viewLayerId('01HV')).toBe('view:01HV');
    expect(viewIdOf('view:01HV')).toBe('01HV');
    expect(viewIdOf('earthquake')).toBeUndefined();
  });

  it('reads a view tile template into its view, keeping only the ticket', () => {
    expect(
      parseTileTemplate('http://localhost:8080/v1/views/01HV/tiles/{z}/{x}/{y}.mvt?v=3'),
    ).toEqual({ layer: 'view:01HV', view: '01HV', query: {} });
    expect(parseTileTemplate('/v1/views/01HV/tiles/{z}/{x}/{y}.mvt?ticket=fst_abc')).toEqual({
      layer: 'view:01HV',
      view: '01HV',
      query: { ticket: 'fst_abc' },
    });
  });

  it('loads a view layer from the view’s own TileJSON, and its tiles from the view', async () => {
    const asked: string[] = [];
    server.use(
      http.get('/v1/views/{viewId}/tiles.json', ({ params, response }) => {
        asked.push(`tiles.json ${String(params.viewId)}`);
        return response(200).json({
          tilejson: '3.0.0',
          tiles: [`http://localhost:8080/v1/views/${String(params.viewId)}/tiles/{z}/{x}/{y}.mvt`],
          minzoom: 0,
          maxzoom: 14,
        });
      }),
      http.get('/v1/views/{viewId}/tiles/{z}/{x}/{y}.mvt', ({ params }) => {
        asked.push(
          `tile ${String(params.viewId)} ${String(params.z)}/${String(params.x)}/${String(params.y)}`,
        );
        return new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile' },
        });
      }),
    );
    const result = await loadLayerTiles(api(), 'view:01HV');
    expect(result).toMatchObject({
      ok: true,
      tiles: { template: { layer: 'view:01HV', view: '01HV' }, maxzoom: 14 },
    });
    if (!result.ok) return;
    const tile = await fetchTile(api(), result.tiles.template, { z: 2, x: 1, y: 3 });
    expect(tile).toEqual({ status: 'ok', features: [] });
    expect(asked).toEqual(['tiles.json 01HV', 'tile 01HV 2/1/3']);
  });
});
