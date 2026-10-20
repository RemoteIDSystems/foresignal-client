// @vitest-environment node
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { summarizeViewport } from './contextSummary';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = () =>
  createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: { sleep: () => Promise.resolve() } });

/** Answers each summary with counts that depend on the box asked about, and records the bodies. */
function serveSummaries(bodies: unknown[]) {
  server.use(
    http.post('/v1/context/summary', async ({ request, response }) => {
      const body = (await request.json()) as { viewport: { bbox: number[] } };
      bodies.push(body);
      const east = body.viewport.bbox[0]! > 0;
      return response(200).json({
        generatedAt: '2026-10-20T12:00:00Z',
        layerCounts: east
          ? [{ layer: 'earthquake', count: 6, liveCount: 6 }]
          : [
              { layer: 'earthquake', count: 23, liveCount: 23 },
              { layer: 'aircraft', count: 4 },
            ],
        activity: [],
        insights: [],
        related: [],
      });
    }),
  );
}

describe('summarizeViewport', () => {
  const now = new Date('2026-10-20T12:00:00Z');

  it('asks for the viewport over the last 24 hours and reads the layer counts', async () => {
    const bodies: unknown[] = [];
    serveSummaries(bodies);
    const result = await summarizeViewport(api(), { bbox: [-130, 20, -60, 55], zoom: 3 }, now);
    expect(bodies).toEqual([
      { viewport: { bbox: [-130, 20, -60, 55] }, timeRange: { start: '2026-10-19T12:00:00.000Z' } },
    ]);
    expect([...result.counts]).toEqual([
      ['earthquake', 23],
      ['aircraft', 4],
    ]);
    expect(result.generatedAt).toBe('2026-10-20T12:00:00Z');
  });

  it('asks about a view across the antimeridian in two halves and adds them', async () => {
    const bodies: { viewport: { bbox: number[] } }[] = [];
    serveSummaries(bodies);
    const result = await summarizeViewport(api(), { bbox: [170, -60, -170, 60], zoom: 2 }, now);
    expect(bodies.map((body) => body.viewport.bbox)).toEqual([
      [170, -60, 180, 60],
      [-180, -60, -170, 60],
    ]);
    expect(result.counts.get('earthquake')).toBe(29);
  });

  it('fails when the backend refuses the context', async () => {
    server.use(
      http.post('/v1/context/summary', ({ response }) =>
        response(400).json({
          type: 'https://foresignal.ai/problems/validation-failed',
          title: 'Bad Request',
          status: 400,
          detail: 'The workspace context is not valid.',
        }),
      ),
    );
    await expect(
      summarizeViewport(api(), { bbox: [-10, -10, 10, 10], zoom: 1 }, now),
    ).rejects.toThrow();
  });
});
