import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import { referenceArea, referenceAreaOutline } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { areaGeometry, getReferenceArea, searchReferenceAreas } from './referenceAreas';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('reference areas API', () => {
  it('searches by free text', async () => {
    let q: string | null = null;
    server.use(
      http.get('/v1/reference/areas', ({ request, response }) => {
        q = new URL(request.url).searchParams.get('q');
        return response(200).json([referenceArea()]);
      }),
    );
    const results = await searchReferenceAreas(client(), 'France');
    expect(q).toBe('France');
    expect(results[0]?.code).toBe('FR');
  });

  it('reads an outline by code', async () => {
    let path: string | undefined;
    server.use(
      http.get('/v1/reference/areas/{code}', ({ params, response }) => {
        path = String(params.code);
        return response(200).json(referenceAreaOutline());
      }),
    );
    const outline = await getReferenceArea(client(), 'FR');
    expect(path).toBe('FR');
    expect(outline.geometry.type).toBe('Polygon');
  });
});

describe('areaGeometry', () => {
  it('fetches the outline for a coded area', async () => {
    server.use(
      http.get('/v1/reference/areas/{code}', ({ response }) =>
        response(200).json(referenceAreaOutline()),
      ),
    );
    const drawn = await areaGeometry(client(), referenceArea());
    expect(drawn?.geometry.type).toBe('Polygon');
  });

  it('draws a place as a point without a fetch', async () => {
    const place = referenceArea({
      kind: 'place',
      code: null,
      name: 'Lyon',
      label: 'Lyon, France',
      lon: 4.8,
      lat: 45.7,
    });
    const drawn = await areaGeometry(client(), place);
    expect(drawn?.geometry).toEqual({ type: 'Point', coordinates: [4.8, 45.7] });
  });
});
