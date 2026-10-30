import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import { userSession } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { listSessions, revokeAllSessions, revokeSession } from './sessions';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('sessions API', () => {
  it('lists the active sessions', async () => {
    server.use(
      http.get('/v1/auth/sessions', ({ response }) =>
        response(200).json({ items: [userSession({ current: true })] }),
      ),
    );
    const page = await listSessions(client());
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.current).toBe(true);
  });

  it('revokes one session by id', async () => {
    let path: string | undefined;
    server.use(
      http.delete('/v1/auth/sessions/{id}', ({ params, response }) => {
        path = String(params.id);
        return response(204).empty();
      }),
    );
    await revokeSession(client(), 'abc');
    expect(path).toBe('abc');
  });

  it('revokes all sessions', async () => {
    let hit = false;
    server.use(
      http.delete('/v1/auth/sessions', ({ response }) => {
        hit = true;
        return response(204).empty();
      }),
    );
    await revokeAllSessions(client());
    expect(hit).toBe(true);
  });
});
