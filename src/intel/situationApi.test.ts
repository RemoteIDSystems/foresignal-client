// @vitest-environment node
import { json, standInApi } from './testing/standIn';
import { changes, situation, situationSummary, SITUATION_ID, timeline } from './testing/fixtures';
import {
  getSituation,
  getSituationChanges,
  getSituationTimeline,
  listSituationMembers,
  listSituations,
} from './situationApi';

const path = `/v1/situations/${SITUATION_ID}`;

describe('the situation requests', () => {
  it('lists situations with the text, statuses and area asked for, 500 at most', async () => {
    const { api, asked } = standInApi({
      'GET /v1/situations': () => json({ items: [situationSummary], nextCursor: null }),
    });
    const items = await listSituations(api, {
      q: 'swarm',
      status: ['active', 'emerging'],
      bbox: [-124, 38, -122, 40],
    });
    expect(items).toEqual([situationSummary]);
    const query = new URLSearchParams(asked[0]!.split('?')[1]);
    expect(query.get('q')).toBe('swarm');
    expect(query.getAll('status').join(',')).toBe('active,emerging');
    expect(query.get('bbox')).toBe('-124,38,-122,40');
    expect(query.get('limit')).toBe('500');
  });

  it('reads a situation, its members, its timeline from a time, and what changed since', async () => {
    const { api, asked } = standInApi({
      [`GET ${path}`]: () => json(situation),
      [`GET ${path}/members`]: () => json({ items: [], nextCursor: null }),
      [`GET ${path}/timeline`]: () => json({ items: timeline, nextCursor: null }),
      [`GET ${path}/changes`]: () => json(changes),
    });
    expect((await getSituation(api, SITUATION_ID)).title).toBe(situation.title);
    expect(await listSituationMembers(api, SITUATION_ID)).toEqual([]);
    expect(
      await getSituationTimeline(api, SITUATION_ID, { from: '2026-09-20T00:00:00Z' }),
    ).toHaveLength(3);
    expect(
      (await getSituationChanges(api, SITUATION_ID, '2026-09-20T00:00:00Z')).status.changed,
    ).toBe(true);
    expect(asked).toContain(`GET ${path}/timeline?limit=500&from=2026-09-20T00%3A00%3A00Z`);
    expect(asked).toContain(`GET ${path}/changes?since=2026-09-20T00%3A00%3A00Z`);
  });
});
