import { act, renderHook } from '@testing-library/react';
import { createForesignalClient } from '../api/client';
import { SUMMARY_DEBOUNCE_MS, useContextSummary } from './contextSummary';

/** The viewports the stand-in backend was asked about, and what it answers. */
let asked: number[][] = [];
let answer: () => Response;

const api = createForesignalClient({
  baseUrl: 'http://api.test',
  retry: false,
  fetch: async (request) => {
    asked.push(((await request.json()) as { viewport: { bbox: number[] } }).viewport.bbox);
    return answer();
  },
});

const summary = (cacheAgeSeconds: number) =>
  new Response(
    JSON.stringify({
      generatedAt: '2026-10-20T12:00:00Z',
      cacheAgeSeconds,
      layerCounts: [{ layer: 'earthquake', count: 3 }],
      activity: [],
      insights: [],
      related: [],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

beforeEach(() => {
  vi.useFakeTimers();
  asked = [];
  answer = () => summary(0);
});
afterEach(() => vi.useRealTimers());

/** Lets the timers and the request run to the next point where nothing is pending. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('useContextSummary', () => {
  it('reads once the viewport settles, only the latest one, and again once the cached copy expires', async () => {
    // The committed viewport keeps its identity until it changes, as the store's does.
    const first = { bbox: [0, 0, 1, 1] as [number, number, number, number], zoom: 3 };
    const second = { bbox: [0, 0, 2, 2] as [number, number, number, number], zoom: 3 };
    const { result, rerender } = renderHook(({ viewport }) => useContextSummary(api, viewport), {
      initialProps: { viewport: first },
    });
    rerender({ viewport: second });
    await advance(SUMMARY_DEBOUNCE_MS);
    expect(asked).toEqual([[0, 0, 2, 2]]);
    expect(result.current.summary?.counts.get('earthquake')).toBe(3);
    // A copy 25 s old is fresh for 5 s more; it is read again no sooner than 30 s on.
    answer = () => summary(25);
    await advance(29_000);
    expect(asked).toHaveLength(1);
    await advance(2_000);
    expect(asked).toHaveLength(2);
  });

  it('keeps the last summary and says why when a read fails', async () => {
    const viewport = { bbox: [0, 0, 1, 1] as [number, number, number, number], zoom: 3 };
    const { result } = renderHook(() => useContextSummary(api, viewport));
    await advance(SUMMARY_DEBOUNCE_MS);
    answer = () =>
      new Response(JSON.stringify({ title: 'Too Many Requests', status: 429 }), {
        status: 429,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await advance(31_000);
    expect(result.current.summary).toBeDefined();
    expect(result.current.error).toBeTruthy();
    warn.mockRestore();
  });
});
