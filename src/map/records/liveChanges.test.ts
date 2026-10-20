import type { Change, LiveEvent } from '../../api/stream/ChangeStream';
import { changedArea, liveArea, parseTileKey, tileTouches } from './liveChanges';

function change(overrides: Partial<Change>): Change {
  return {
    seq: 1,
    source: 'usgs-earthquakes',
    externalId: 'q1',
    kind: 'earthquake',
    version: 2,
    observedAt: '2026-10-20T12:00:00Z',
    tombstone: false,
    leftFilter: false,
    ...overrides,
  };
}

describe('changedArea', () => {
  it('takes the box a record is in now and the boxes it was in before', () => {
    expect(
      changedArea(
        change({
          bbox: [-120, 35, -120, 35],
          prevPersistedBbox: [-121, 36, -121, 36],
          prevLiveBbox: null,
        }),
      ),
    ).toEqual({
      kind: 'earthquake',
      source: 'usgs-earthquakes',
      boxes: [
        [-120, 35, -120, 35],
        [-121, 36, -121, 36],
      ],
    });
  });

  it('falls back to a point geometry, and gives nothing without a place', () => {
    expect(
      changedArea(change({ geometry: { type: 'Point', coordinates: [10, 20] } }))?.boxes,
    ).toEqual([[10, 20, 10, 20]]);
    expect(changedArea(change({ geometry: null }))).toBeUndefined();
  });

  it('gives nothing for raster frame announcements, which are not records', () => {
    expect(changedArea(change({ kind: 'raster-frame', bbox: [0, 0, 1, 1] }))).toBeUndefined();
  });
});

describe('liveArea', () => {
  it('takes where an update is now and where it was', () => {
    const event: LiveEvent = {
      sourceId: 'ais',
      externalId: 'v1',
      kind: 'vessel',
      observedAt: '2026-10-20T12:00:00Z',
      version: 3,
      bbox: [1, 2, 1, 2],
      prevBbox: [0, 2, 0, 2],
      leftFilter: false,
    };
    expect(liveArea(event)).toEqual({
      kind: 'vessel',
      source: 'ais',
      boxes: [
        [1, 2, 1, 2],
        [0, 2, 0, 2],
      ],
    });
  });
});

describe('tileTouches', () => {
  // Tile 2/0/0 covers longitudes −180…−90 and latitudes 66.5…85.05 (Web Mercator).
  const tile = parseTileKey('2/0/0');

  it('reads a tile key', () => {
    expect(tile).toEqual({ z: 2, x: 0, y: 0 });
  });

  it('holds a point inside, and one just over its edge (the tile buffer)', () => {
    expect(tileTouches(tile, [-120, 70, -120, 70])).toBe(true);
    expect(tileTouches(tile, [-89, 70, -89, 70])).toBe(true);
    expect(tileTouches(tile, [-60, 70, -60, 70])).toBe(false);
    expect(tileTouches(tile, [-120, 40, -120, 40])).toBe(false);
  });

  it('reads a box across the antimeridian as two', () => {
    expect(tileTouches(tile, [170, 60, -170, 70])).toBe(true);
    expect(tileTouches(parseTileKey('2/2/0'), [170, 60, -170, 70])).toBe(false);
  });
});
