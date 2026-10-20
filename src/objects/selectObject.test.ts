// @vitest-environment node
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { hitForRef } from './selectObject';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

/** Serves one dossier for whatever ref is asked about. */
function serveDossier(ref: string, envelope: object, fields?: object) {
  server.use(
    http.get('/v1/objects/{ref}/dossier', ({ response }) =>
      response(200).json({
        ref,
        generatedAt: '2026-10-20T12:00:00Z',
        envelope: { ref, ...envelope },
        sections: fields ? { overview: { status: 'ok', fields } } : {},
      } as never),
    ),
  );
}

describe('hitForRef', () => {
  it('selects a record as the map would pick it: its kind, source and decoded id, at its place', async () => {
    const ref = 'record:usgs-earthquakes/nc%2F1';
    serveDossier(
      ref,
      { type: 'record', title: 'M 2.5', geometry: { type: 'Point', coordinates: [-122.7, 38.8] } },
      { kind: 'earthquake', mag: 2.5 },
    );
    expect(await hitForRef(api(), ref)).toEqual({
      id: {
        layer: 'earthquake',
        kind: 'earthquake',
        source: 'usgs-earthquakes',
        externalId: 'nc/1',
      },
      title: 'M 2.5',
      type: 'point',
      longitude: -122.7,
      latitude: 38.8,
      distance: 0,
    });
  });

  it('selects any other object by its ref, with no place when it has none', async () => {
    serveDossier('situation:42', { type: 'situation', title: 'Port disruption' });
    const hit = await hitForRef(api(), 'situation:42');
    expect(hit.id).toEqual({ layer: 'situation', kind: 'situation', ref: 'situation:42' });
    expect(hit.title).toBe('Port disruption');
    expect(Number.isFinite(hit.longitude)).toBe(false);
  });
});
