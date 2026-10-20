import type { Track } from './timeApi';
import { trailOf } from './trail';

function track(coordinates: number[][][], properties: Partial<Track['properties']> = {}): Track {
  return {
    type: 'Feature',
    geometry: { type: 'MultiLineString', coordinates } as Track['geometry'],
    properties: {
      sourceId: 'ais',
      externalId: 'v1',
      from: '2026-10-20T06:00:00Z',
      to: '2026-10-20T12:00:00Z',
      times: [],
      pointsReturned: 0,
      segments: coordinates.length,
      watermarkSeq: 1,
      ...properties,
    },
  };
}

describe('trailOf', () => {
  it('reads each segment, collapsing repeated positions', () => {
    const trail = trailOf(
      track(
        [
          [
            [0, 0],
            [0, 0],
            [1, 1],
            [2, 1],
          ],
          [
            [5, 5],
            [6, 6],
          ],
        ],
        { approximate: true, live: true },
      ),
    );
    expect(trail.lines).toEqual([
      [
        [0, 0],
        [1, 1],
        [2, 1],
      ],
      [
        [5, 5],
        [6, 6],
      ],
    ]);
    expect(trail.points).toBe(6);
    expect(trail.approximate).toBe(true);
    expect(trail.live).toBe(true);
  });

  it('draws nothing for a stationary record (its one point repeated) or no positions', () => {
    const still = trailOf(
      track([
        [
          [-122.77, 38.79],
          [-122.77, 38.79],
        ],
      ]),
    );
    expect(still.lines).toEqual([]);
    expect(still.points).toBe(2);
    expect(trailOf({ ...track([]), geometry: null }).lines).toEqual([]);
  });
});
