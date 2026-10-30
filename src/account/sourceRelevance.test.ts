import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import { sourceRelevanceAnalysis } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { analyzeTriggerSources } from './sourceRelevance';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('analyzeTriggerSources', () => {
  it('sends the candidate ids and returns the advisory verdicts', async () => {
    let sent: { sourceIds?: unknown } | undefined;
    server.use(
      http.post('/v1/triggers/analyze-sources', async ({ request, response }) => {
        sent = (await request.json()) as { sourceIds?: unknown };
        return response(200).json(sourceRelevanceAnalysis());
      }),
    );
    const result = await analyzeTriggerSources(client(), ['usgs-earthquakes', 'nws-alerts']);
    expect(sent).toEqual({ sourceIds: ['usgs-earthquakes', 'nws-alerts'] });
    expect(result.advisory).toBe(true);
    expect(result.sources.map((source) => source.verdict)).toEqual(['relevant', 'marginal']);
  });
});
