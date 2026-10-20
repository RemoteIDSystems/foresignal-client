import { finding, FINDING_ID, seriesData } from './testing/analyticsFixtures';
import { json, standInApi } from './testing/standIn';
import {
  dismissFinding,
  getSeriesData,
  listAnalysisSeries,
  listFindings,
  listProjectedImpacts,
} from './analyticsApi';
import { SITUATION_ID } from './testing/fixtures';

/** The query of an asked request, as search parameters. */
const query = (asked: string) => new URL(`http://api.test${asked.split(' ')[1]}`).searchParams;

describe('the analytics reads and the dismissal', () => {
  it('reads a situation’s open findings and a region’s impacts and series', async () => {
    const { api, asked } = standInApi({
      'GET /v1/analytics/findings': () => json({ items: [finding], nextCursor: null }),
      'GET /v1/analytics/impacts': () => json({ items: [], nextCursor: null }),
      'GET /v1/analytics/series': () => json({ items: [], nextCursor: null }),
    });
    expect(await listFindings(api, { situationId: SITUATION_ID })).toEqual([finding]);
    expect(query(asked[0]!).get('situationId')).toBe(SITUATION_ID);
    expect(query(asked[0]!).getAll('status')).toEqual(['open']);
    expect(query(asked[0]!).get('limit')).toBe('500');
    await listProjectedImpacts(api, { region: 'US-CA', since: '2026-10-01T06:00:00Z' });
    expect(query(asked[1]!).get('region')).toBe('US-CA');
    expect(query(asked[1]!).get('since')).toBe('2026-10-01T06:00:00Z');
    await listAnalysisSeries(api, { region: ['US-CA'] });
    expect(query(asked[2]!).getAll('region')).toEqual(['US-CA']);
    expect(query(asked[2]!).get('enabled')).toBe('true');
  });

  it('reads a series’ points over a window', async () => {
    const ref = 'rollup:day/*/earthquake/US-CA';
    const { api, asked } = standInApi({
      'GET /v1/analytics/series/data': () => json(seriesData(ref, 2, 1)),
    });
    const data = await getSeriesData(api, ref, {
      from: '2026-07-20T00:00:00Z',
      to: '2026-10-18T00:00:00Z',
    });
    expect(data.points).toHaveLength(60);
    expect(query(asked[0]!).get('ref')).toBe(ref);
    expect(query(asked[0]!).get('from')).toBe('2026-07-20T00:00:00Z');
  });

  it('dismisses a finding as a merge patch with the reason', async () => {
    let type: string | null = null;
    const { api, asked, bodies } = standInApi({
      [`PATCH /v1/analytics/findings/${FINDING_ID}`]: (request) => {
        type = request.headers.get('content-type');
        return json({ ...finding, status: 'dismissed' });
      },
    });
    const done = await dismissFinding(api, FINDING_ID, 'A known quarry');
    expect(done.status).toBe('dismissed');
    expect(asked).toEqual([`PATCH /v1/analytics/findings/${FINDING_ID}`]);
    expect(bodies[0]).toEqual({ status: 'dismissed', reason: 'A known quarry' });
    expect(type).toBe('application/merge-patch+json');
  });
});
