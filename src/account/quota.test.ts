import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import { meLlmBudget, quotaUsage } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { getMyLlmBudget, getMyQuota } from './quota';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('quota and budget API', () => {
  it('reads quota and usage', async () => {
    server.use(http.get('/v1/me/quota', ({ response }) => response(200).json(quotaUsage())));
    const result = await getMyQuota(client());
    expect(result.quota.maxAlerts).toBe(10);
    expect((result.usage as Record<string, unknown>).alerts).toBe(3);
  });

  it('reads the LLM budget', async () => {
    server.use(http.get('/v1/me/llm/budget', ({ response }) => response(200).json(meLlmBudget())));
    const result = await getMyLlmBudget(client());
    expect(result.totalSpentUsd).toBe(1.25);
    expect(result.providers[0]?.shared).toBe(true);
  });
});
