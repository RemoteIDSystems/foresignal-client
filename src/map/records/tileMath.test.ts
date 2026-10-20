// @vitest-environment node
import {
  boundsAround,
  MAX_MERCATOR_LATITUDE,
  planTiles,
  tileBounds,
  tileKey,
  tilePointToLonLat,
  tilesInRect,
  tileX,
  tileY,
  zoomForResolution,
} from './tileMath';

describe('tile math', () => {
  it('finds the tile holding a place, row 0 at the north', () => {
    // The Geysers, California, in the fixture tile 5/5/12.
    expect([tileX(-122.76, 5), tileY(38.78, 5)]).toEqual([5, 12]);
    expect([tileX(-180, 0), tileY(0, 0)]).toEqual([0, 0]);
    expect(tileX(180, 3)).toBe(7);
    expect(tileY(90, 3)).toBe(0);
    expect(tileY(-90, 3)).toBe(7);
  });

  it('turns tile coordinates into degrees and back to the same tile', () => {
    const [lon, lat] = tilePointToLonLat({ z: 5, x: 5, y: 12 }, 4096, 339, 1033);
    expect(lon).toBeCloseTo(-122.8189, 4);
    expect(lat).toBeCloseTo(38.8033, 4);
    expect(tilePointToLonLat({ z: 0, x: 0, y: 0 }, 4096, 2048, 2048)).toEqual([0, 0]);
    const corner = tilePointToLonLat({ z: 0, x: 0, y: 0 }, 1, 0, 0);
    expect(corner[0]).toBe(-180);
    expect(corner[1]).toBeCloseTo(MAX_MERCATOR_LATITUDE, 9);
  });

  it('gives a tile its bounds', () => {
    const b = tileBounds({ z: 1, x: 1, y: 0 });
    expect([b.west, b.east, b.south]).toEqual([0, 180, 0]);
    expect(b.north).toBeCloseTo(MAX_MERCATOR_LATITUDE, 9);
    expect(tileKey({ z: 3, x: 1, y: 2 })).toBe('3/1/2');
  });

  it('converts ground resolution to map zoom with 512-pixel tiles', () => {
    // At zoom 0 the 40,075 km equator spans 512 pixels.
    expect(zoomForResolution(40_075_016.686 / 512, 0)).toBeCloseTo(0, 6);
    expect(zoomForResolution(40_075_016.686 / 512 / 1024, 0)).toBeCloseTo(10, 6);
    // Mercator stretches with latitude: the same resolution is one zoom higher at 60°.
    expect(zoomForResolution(1000, 60) - zoomForResolution(1000, 0)).toBeCloseTo(-1, 6);
    expect(zoomForResolution(1e9, 0)).toBe(0);
  });

  it('treats east and south edges as exclusive', () => {
    expect(tilesInRect({ west: 0, south: 0, east: 90, north: 10 }, 2).map(tileKey)).toEqual([
      '2/2/1',
    ]);
  });

  it('covers a rectangle, on both sides of the antimeridian when it crosses it', () => {
    expect(tilesInRect({ west: -10, south: -10, east: 10, north: 10 }, 1).map(tileKey)).toEqual([
      '1/0/0',
      '1/0/1',
      '1/1/0',
      '1/1/1',
    ]);
    expect(tilesInRect({ west: 170, south: 10, east: -170, north: 20 }, 2).map(tileKey)).toEqual([
      '2/3/1',
      '2/0/1',
    ]);
  });
});

describe('planTiles', () => {
  const base = { minzoom: 0, maxzoom: 16, maxTiles: 64 };

  it('requests the view at its whole zoom, inside the layer range', () => {
    const rect = { west: -123, south: 37, east: -121, north: 39 };
    expect(planTiles({ ...base, rect, zoom: 5.9 }).map(tileKey)).toEqual(['5/5/12']);
    expect(planTiles({ ...base, rect, zoom: 20, maxzoom: 4 }).map(tileKey)).toEqual(['4/2/6']);
    expect(planTiles({ ...base, rect, zoom: 0.3, minzoom: 2 }).map(tileKey)).toEqual(['2/0/1']);
  });

  it('steps the zoom down until the view fits the tile budget', () => {
    const world = { west: -180, south: -85, east: 180, north: 85 };
    const tiles = planTiles({ ...base, rect: world, zoom: 6, maxTiles: 16 });
    expect(tiles.length).toBeLessThanOrEqual(16);
    expect(tiles.every((t) => t.z === 2)).toBe(true);
    expect(planTiles({ ...base, rect: undefined, zoom: 0 }).map(tileKey)).toEqual(['0/0/0']);
  });

  it('keeps to the layer bounds and returns nothing outside them', () => {
    const bounds = { west: 0, south: 0, east: 10, north: 10 };
    const rect = { west: -50, south: -50, east: 50, north: 50 };
    expect(planTiles({ ...base, rect, zoom: 3, bounds }).map(tileKey)).toEqual(['3/4/3']);
    expect(
      planTiles({ ...base, rect: { west: 20, south: 20, east: 30, north: 30 }, zoom: 3, bounds }),
    ).toEqual([]);
  });

  it('splits a view across the antimeridian against the bounds', () => {
    const rect = { west: 170, south: -5, east: -170, north: 5 };
    expect(planTiles({ ...base, rect, zoom: 2 }).map(tileKey)).toEqual([
      '2/3/1',
      '2/3/2',
      '2/0/1',
      '2/0/2',
    ]);
  });
});

describe('boundsAround', () => {
  it('bounds the corners of a flat view', () => {
    expect(
      boundsAround(-80, [
        [-90, 35],
        [-90, 21],
        [-70, 21],
        [-70, 35],
      ]),
    ).toEqual({ west: -90, south: 21, east: -70, north: 35 });
  });

  it('reads a view scrolled across the antimeridian as crossing it', () => {
    expect(
      boundsAround(178, [
        [170, 10],
        [-174, -10],
      ]),
    ).toEqual({ west: 170, south: -10, east: -174, north: 10 });
    // Centered just west of the antimeridian, a wrapped corner is still read east of the center.
    expect(
      boundsAround(-179, [
        [175, 0],
        [-170, 5],
      ]),
    ).toEqual({
      west: 175,
      south: 0,
      east: -170,
      north: 5,
    });
  });

  it('is undefined for no points', () => {
    expect(boundsAround(0, [])).toBeUndefined();
  });
});
