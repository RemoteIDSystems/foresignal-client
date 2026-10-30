import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import { userSourceView } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import {
  createUserSourcesStore,
  disabledSourceIds,
  getMySources,
  updateMySources,
} from './sources';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('disabledSourceIds', () => {
  it('collects the ids of disabled sources only', () => {
    const view = userSourceView([
      { sourceId: 'a', enabled: true },
      { sourceId: 'b', enabled: false },
      { sourceId: 'c', enabled: false },
    ]);
    expect([...disabledSourceIds(view)].sort()).toEqual(['b', 'c']);
    expect(disabledSourceIds(null).size).toBe(0);
  });
});

describe('sources API and store', () => {
  it('reads and replaces the per-user source view', async () => {
    server.use(http.get('/v1/me/sources', ({ response }) => response(200).json(userSourceView())));
    expect((await getMySources(client())).sources).toHaveLength(2);

    let sent: { sources?: unknown } | undefined;
    server.use(
      http.put('/v1/me/sources', async ({ request, response }) => {
        sent = (await request.json()) as { sources?: unknown };
        return response(200).json(userSourceView([{ sourceId: 'a', enabled: false }]));
      }),
    );
    const saved = await updateMySources(client(), [{ sourceId: 'a', enabled: false }]);
    expect(saved.sources[0]?.enabled).toBe(false);
    expect(sent).toMatchObject({ sources: [{ sourceId: 'a', enabled: false }] });
  });

  it('loads the view into the store', async () => {
    server.use(
      http.get('/v1/me/sources', ({ response }) =>
        response(200).json(userSourceView([{ sourceId: 'x', enabled: false }])),
      ),
    );
    const store = createUserSourcesStore();
    await store.load(client());
    expect([...disabledSourceIds(store.get())]).toEqual(['x']);
    store.clear();
    expect(store.get()).toBeNull();
  });
});
