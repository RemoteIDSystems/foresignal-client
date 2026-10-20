// @vitest-environment node
import { createForesignalClient } from '../api/client';
import { readGlance, seriesPoints, seriesTotal, statsWindow, type StatsSeries } from './glanceApi';

describe('the glance', () => {
  it('is revalidated with its ETag, and a 304 keeps the last status', async () => {
    const headers: (string | null)[] = [];
    let first = true;
    const api = createForesignalClient({
      baseUrl: 'http://api.test',
      retry: false,
      fetch: async (request) => {
        headers.push(request.headers.get('If-None-Match'));
        if (!first) return new Response(null, { status: 304 });
        first = false;
        return new Response(JSON.stringify({ status: 'ok', lastSeq: 1107 }), {
          headers: { 'Content-Type': 'application/json', ETag: '"g-1"' },
        });
      },
    });
    const read = await readGlance(api);
    expect(read).toEqual({ glance: { status: 'ok', lastSeq: 1107 }, etag: '"g-1"' });
    expect(await readGlance(api, read)).toBe(read);
    expect(headers).toEqual([null, '"g-1"']);
  });
});

describe('the activity window', () => {
  it('runs from the start of the hour a day ago to the current minute', () => {
    expect(statsWindow(new Date('2026-10-20T19:54:31.250Z'))).toEqual({
      from: '2026-10-19T19:00:00.000Z',
      to: '2026-10-20T19:54:00.000Z',
    });
  });

  it('sums a series, and reads an empty one as no points', () => {
    const series = {
      series: [
        {
          key: null,
          points: [
            { t: 'a', value: 21 },
            { t: 'b', value: 24 },
          ],
        },
      ],
    } as unknown as StatsSeries;
    expect(seriesTotal(series)).toBe(45);
    expect(seriesPoints({ series: [] } as unknown as StatsSeries)).toEqual([]);
    expect(seriesTotal(undefined)).toBe(0);
  });
});
