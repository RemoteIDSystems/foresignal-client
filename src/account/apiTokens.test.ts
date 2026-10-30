import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import { apiToken, apiTokenCreated } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { createMyToken, listMyTokens, revokeMyToken } from './apiTokens';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('personal tokens API', () => {
  it('lists tokens (prefix only, no secret)', async () => {
    server.use(http.get('/v1/me/tokens', ({ response }) => response(200).json([apiToken()])));
    const tokens = await listMyTokens(client());
    expect(tokens[0]?.tokenPrefix).toBe('fsr_AbC1');
    expect(tokens[0]).not.toHaveProperty('token');
  });

  it('creates a token and returns its one-time secret, sending name and scope', async () => {
    let sent: { name?: unknown; scope?: unknown } | undefined;
    server.use(
      http.post('/v1/me/tokens', async ({ request, response }) => {
        sent = (await request.json()) as { name?: unknown; scope?: unknown };
        return response(201).json(apiTokenCreated({ token: 'fsr_fresh_secret' }));
      }),
    );
    const created = await createMyToken(client(), {
      name: 'CLI',
      scope: 'agent',
      privateAccess: false,
    });
    expect(created.token).toBe('fsr_fresh_secret');
    expect(sent).toMatchObject({ name: 'CLI', scope: 'agent' });
  });

  it('revokes a token by id', async () => {
    let path: string | undefined;
    server.use(
      http.delete('/v1/me/tokens/{id}', ({ params, response }) => {
        path = String(params.id);
        return response(204).empty();
      }),
    );
    await revokeMyToken(client(), 'tok1');
    expect(path).toBe('tok1');
  });
});
