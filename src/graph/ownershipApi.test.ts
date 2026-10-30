import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import { ownershipChain as ownershipChainFixture } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { ownershipChain } from './ownershipApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('ownershipChain', () => {
  it('sends the seed refs with the documented defaults and returns the chains', async () => {
    let sent: { refs?: unknown; direction?: unknown; depth?: unknown } | undefined;
    server.use(
      http.post('/v1/graph/ownership-chain', async ({ request, response }) => {
        sent = (await request.json()) as typeof sent;
        return response(200).json(ownershipChainFixture());
      }),
    );
    const result = await ownershipChain(client(), ['organization:01J0000000000000000000000O']);
    expect(sent).toMatchObject({
      refs: ['organization:01J0000000000000000000000O'],
      direction: 'both',
      depth: 6,
    });
    expect(result.chains[0]?.node.title).toBe('Parent Co');
  });

  it('passes a chosen direction', async () => {
    let direction: unknown;
    server.use(
      http.post('/v1/graph/ownership-chain', async ({ request, response }) => {
        direction = ((await request.json()) as { direction?: unknown }).direction;
        return response(200).json(ownershipChainFixture([]));
      }),
    );
    await ownershipChain(client(), ['organization:x'], { direction: 'in' });
    expect(direction).toBe('in');
  });
});
