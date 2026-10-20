// @vitest-environment node
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { groupResults, resultRef, searchAll, type SearchResult } from './searchApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

const hit = (docType: SearchResult['docType'], docId: string, extra = {}): SearchResult => ({
  docType,
  docId,
  score: 1,
  title: docId,
  ...extra,
});

describe('search', () => {
  it('asks in hybrid mode while semantic search is ready, and in text mode otherwise', async () => {
    const modes: (string | null)[] = [];
    server.use(
      http.get('/v1/search', ({ request, response }) => {
        modes.push(new URL(request.url).searchParams.get('mode'));
        return response(200).json({ mode: 'text', items: [] } as never);
      }),
    );
    await searchAll(api(), 'quake', true);
    await searchAll(api(), 'quake', false);
    expect(modes).toEqual(['hybrid', 'text']);
  });

  it('groups results by type in the drop-down’s order, leaving out empty groups', () => {
    const groups = groupResults([hit('alert', 'a1'), hit('record', 'r1'), hit('record', 'r2')]);
    expect(groups.map((group) => [group.group, group.items.map((item) => item.docId)])).toEqual([
      ['record', ['r1', 'r2']],
      ['alert', ['a1']],
    ]);
  });

  it('names the object a result selects', () => {
    expect(
      resultRef(
        hit('record', 'x', { record: { source: 'usgs-earthquakes', externalId: 'nc/1' } as never }),
      ),
    ).toBe('record:usgs-earthquakes/nc%2F1');
    expect(resultRef(hit('alert', '42'))).toBe('alert:42');
    expect(resultRef(hit('briefing', 'b7'))).toBe('briefing:b7');
    expect(resultRef(hit('record', 'x'))).toBeUndefined();
  });
});
