// @vitest-environment node
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { loadHistoryFrames, loadTimeline, loadTrack } from './timeApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });
const window = { from: Date.UTC(2026, 9, 19, 12, 0, 0, 400), to: Date.UTC(2026, 9, 20, 12) };

describe('the time machine’s requests', () => {
  it('reads the histogram for the drawn kinds in the view, to the whole second', async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get('/v1/timeline', ({ request, response }) => {
        query = new URL(request.url).searchParams;
        return response(200).json({
          from: '2026-10-19T12:00:00Z',
          to: '2026-10-20T12:00:00Z',
          bucket: '10m',
          timeField: 'observed',
          buckets: [{ t: '2026-10-19T12:00:00Z', total: 3 }],
          retainedFrom: '2026-10-19T12:00:00Z',
        });
      }),
    );
    const timeline = await loadTimeline(api(), window, ['earthquake', 'vessel'], [-10, 40, 20, 60]);
    expect(timeline.buckets).toHaveLength(1);
    expect(query?.get('from')).toBe('2026-10-19T12:00:00Z');
    expect(query?.get('to')).toBe('2026-10-20T12:00:00Z');
    expect(query?.getAll('kind').join(',')).toBe('earthquake,vessel');
    expect(query?.get('bbox')).toBe('-10,40,20,60');
  });

  it('asks every kind’s histogram when no kind is on', async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get('/v1/timeline', ({ request, response }) => {
        query = new URL(request.url).searchParams;
        return response(200).json({
          from: '2026-10-19T12:00:00Z',
          to: '2026-10-20T12:00:00Z',
          bucket: '10m',
          timeField: 'observed',
          buckets: [],
        });
      }),
    );
    await loadTimeline(api(), window, []);
    expect(query?.has('kind')).toBe(false);
    expect(query?.has('bbox')).toBe(false);
  });

  it('reads history frames with a step that spreads the window over about 120 frames', async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get('/v1/history/frames', ({ request, response }) => {
        query = new URL(request.url).searchParams;
        return response(200).json({
          asOf: '2026-10-19T12:00:00Z',
          step: '720s',
          watermarkSeq: 1,
          keyframe: [],
          frames: [],
        });
      }),
    );
    const frames = await loadHistoryFrames(api(), window, ['earthquake']);
    expect(frames.watermarkSeq).toBe(1);
    expect(query?.get('step')).toBe('720s');
    expect(query?.get('kind')).toBe('earthquake');
  });

  it('reads a record’s track over the window', async () => {
    let url: URL | undefined;
    server.use(
      http.get('/v1/records/{sourceId}/{externalId}/track', ({ request, response }) => {
        url = new URL(request.url);
        return response(200).json({
          type: 'Feature',
          geometry: null,
          properties: {
            sourceId: 'usgs-earthquakes',
            externalId: 'nc 1',
            from: '2026-10-19T12:00:00Z',
            to: '2026-10-20T12:00:00Z',
            times: [],
            pointsReturned: 0,
            segments: 0,
            watermarkSeq: 1,
          },
        });
      }),
    );
    const track = await loadTrack(api(), 'usgs-earthquakes', 'nc 1', window);
    expect(track.properties.externalId).toBe('nc 1');
    expect(url?.pathname).toBe('/v1/records/usgs-earthquakes/nc%201/track');
    expect(url?.searchParams.get('to')).toBe('2026-10-20T12:00:00Z');
  });
});
