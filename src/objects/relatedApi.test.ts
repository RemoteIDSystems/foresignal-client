// @vitest-environment node
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { listRelatedObjects, RELATED_LIMIT } from './relatedApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('listRelatedObjects', () => {
  it('asks for the whole neighborhood in both directions, as of an instant when pinned', async () => {
    let url = new URL('http://unset');
    server.use(
      http.get('/v1/objects/{ref}/related', ({ request, response }) => {
        url = new URL(request.url);
        return response(200).json({ ref: 'situation:1', items: [] });
      }),
    );
    await listRelatedObjects(api(), 'record:usgs-earthquakes/nc%2F1', '2026-10-20T10:00:00Z');
    expect(url.pathname).toBe('/v1/objects/record%3Ausgs-earthquakes%2Fnc%252F1/related');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: String(RELATED_LIMIT),
      direction: 'both',
      asOf: '2026-10-20T10:00:00Z',
    });
  });
});
