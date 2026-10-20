import { act, renderHook } from '@testing-library/react';
import { createForesignalClient } from '../api/client';
import type { ChangeStream, StreamListener } from '../api/stream/ChangeStream';
import { ACTIVITY_SETTLE_MS, GLANCE_REFRESH_MS, useGlance } from './useGlance';

/** The paths the stand-in backend was asked for. */
let asked: string[] = [];

const api = createForesignalClient({
  baseUrl: 'http://api.test',
  retry: false,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    asked.push(path);
    const body =
      path === '/v1/glance'
        ? { status: 'ok' }
        : path === '/v1/stats/timeseries'
          ? { series: [{ key: null, points: [{ t: 'a', value: 3 }] }] }
          : path === '/v1/stats/grid'
            ? { type: 'FeatureCollection', cellSystem: 'h3', features: [] }
            : { by: 'source', measure: 'versions', items: [] };
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  },
});

/** A stand-in live stream whose listener the check can call. */
let listener: StreamListener | undefined;
const stream = {
  listen: (added: StreamListener) => {
    listener = added;
    return () => (listener = undefined);
  },
} as unknown as ChangeStream;

beforeEach(() => {
  vi.useFakeTimers();
  asked = [];
});
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const count = (path: string) => asked.filter((asked) => asked === path).length;

describe('useGlance', () => {
  it('loads the status and activity, follows stream activity once it settles, and refreshes the status', async () => {
    const { result } = renderHook(() => useGlance(api, stream));
    await advance(0);
    expect([...asked].sort()).toEqual([
      '/v1/glance',
      '/v1/stats/grid',
      '/v1/stats/timeseries',
      '/v1/stats/top',
      '/v1/stats/top',
    ]);
    expect(result.current.glance?.glance.status).toBe('ok');
    expect(result.current.series?.series[0]?.points).toHaveLength(1);
    // A burst of changes: one more read of the status and series once the stream is quiet.
    act(() => {
      listener?.changes?.([], 'stream');
      listener?.changes?.([], 'stream');
    });
    await advance(ACTIVITY_SETTLE_MS - 1);
    expect(count('/v1/glance')).toBe(1);
    await advance(1);
    expect(count('/v1/glance')).toBe(2);
    expect(count('/v1/stats/timeseries')).toBe(2);
    expect(count('/v1/stats/grid')).toBe(1);
    // The status on its own interval.
    await advance(GLANCE_REFRESH_MS);
    expect(count('/v1/glance')).toBeGreaterThanOrEqual(3);
  });
});
