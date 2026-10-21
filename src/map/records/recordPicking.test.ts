// @vitest-environment node
import {
  compareHits,
  describeHit,
  hitTest,
  PICK_TOLERANCE_PX,
  tileMayHold,
  type Pickable,
  type PickQuery,
} from './recordPicking';

/** The pointer at 10° E, 0° N, where a pixel spans 1 km. */
const query: PickQuery = { longitude: 10, latitude: 0, metersPerPixel: 1000 };

/** Degrees spanning `px` pixels at the equator in {@link query}'s scale. */
const px = (pixels: number) => (pixels * 1000) / 111_319.49;

const id = { layer: 'earthquake', source: 'usgs', externalId: 'q1', kind: 'earthquake' };

describe('hitTest', () => {
  it('hits a point symbol inside its box widened by the tolerance, and reports the distance', () => {
    const point = (dx: number, dy = 0): Pickable => ({
      id,
      title: 'M 4.2',
      shape: { type: 'point', at: [10 + px(dx), px(dy)], width: 20, height: 10 },
    });
    const hit = hitTest(point(6, 3), query);
    expect(hit).toMatchObject({ type: 'point', title: 'M 4.2', width: 20, height: 10 });
    expect(hit!.distance).toBeCloseTo(Math.hypot(6, 3), 3);
    expect(hit!.longitude).toBeCloseTo(10 + px(6));
    expect(hitTest(point(10 + PICK_TOLERANCE_PX - 0.1), query)).toBeDefined();
    expect(hitTest(point(10 + PICK_TOLERANCE_PX + 0.1), query)).toBeUndefined();
    expect(hitTest(point(0, 5 + PICK_TOLERANCE_PX + 0.1), query)).toBeUndefined();
  });

  it('hits a line within half its width plus the tolerance', () => {
    const line = (offset: number): Pickable => ({
      id,
      shape: {
        type: 'line',
        lines: [
          [
            [9, px(offset)],
            [11, px(offset)],
          ],
        ],
        width: 2,
      },
    });
    expect(hitTest(line(4.9), query)?.distance).toBeCloseTo(4.9, 3);
    expect(hitTest(line(5.1), query)).toBeUndefined();
  });

  it('hits inside a polygon but not in its hole, and inside a cell', () => {
    const square = (half: number): [number, number][] => [
      [10 - half, -half],
      [10 + half, -half],
      [10 + half, half],
      [10 - half, half],
      [10 - half, -half],
    ];
    const ring: Pickable = { id, shape: { type: 'polygon', polygons: [[square(1)]] } };
    const holed: Pickable = {
      id,
      shape: { type: 'polygon', polygons: [[square(1), square(0.5)]] },
    };
    expect(hitTest(ring, query)).toMatchObject({ type: 'polygon', distance: 0, longitude: 10 });
    expect(hitTest(holed, query)).toBeUndefined();
    expect(hitTest({ id, shape: { type: 'cell', ring: square(1) } }, query)).toMatchObject({
      type: 'cell',
      bounds: [9, -1, 11, 1],
    });
  });

  it('measures across the antimeridian the short way round', () => {
    const near: Pickable = {
      id,
      shape: { type: 'point', at: [-180 + px(1), 0], width: 10, height: 10 },
    };
    expect(hitTest(near, { ...query, longitude: 180 - px(1) })?.distance).toBeCloseTo(2, 3);
  });
});

describe('compareHits', () => {
  it('puts points over lines over areas, nearest first within each', () => {
    const hit = (type: 'point' | 'line' | 'cell', distance: number) => ({
      id,
      type,
      longitude: 0,
      latitude: 0,
      distance,
    });
    const sorted = [hit('cell', 0), hit('line', 1), hit('point', 3), hit('point', 1)].sort(
      compareHits,
    );
    expect(sorted.map((h) => `${h.type}${h.distance}`)).toEqual([
      'point1',
      'point3',
      'line1',
      'cell0',
    ]);
  });
});

describe('tileMayHold', () => {
  it('takes the tiles under the pointer and those whose symbols could reach it', () => {
    // Zoom 1: tile 1/1/0 is 0..180° E, 0..85° N.
    expect(tileMayHold('1/1/0', { longitude: 90, latitude: 40, metersPerPixel: 1000 })).toBe(true);
    expect(tileMayHold('1/1/0', { longitude: -90, latitude: 40, metersPerPixel: 1000 })).toBe(
      false,
    );
    // Just west of the tile, within 40 px of 1 km.
    expect(tileMayHold('1/1/0', { longitude: -0.2, latitude: 40, metersPerPixel: 1000 })).toBe(
      true,
    );
    expect(tileMayHold('1/1/0', { longitude: -1, latitude: 40, metersPerPixel: 1000 })).toBe(false);
    // Across the antimeridian from the tile's east edge.
    expect(tileMayHold('1/1/0', { longitude: -179.8, latitude: 40, metersPerPixel: 1000 })).toBe(
      true,
    );
    expect(tileMayHold('not-a-tile', query)).toBe(false);
  });
});

describe('describeHit', () => {
  it('names a record by its title and kind, and a cell by its count', () => {
    expect(
      describeHit({ id, title: 'M 4.2', type: 'point', longitude: 0, latitude: 0, distance: 0 }),
    ).toEqual({ title: 'M 4.2', detail: 'Earthquake · usgs' });
    expect(
      describeHit({
        id: { layer: 'aircraft', kind: 'aircraft', count: 1234 },
        type: 'cell',
        longitude: 0,
        latitude: 0,
        distance: 0,
      }),
    ).toEqual({ title: '1,234 records', detail: 'Aircraft · aggregated' });
    expect(
      describeHit({
        id: { layer: 'vessel', kind: 'vessel', count: 12, layers: 3 },
        type: 'cell',
        longitude: 0,
        latitude: 0,
        distance: 0,
      }),
    ).toEqual({ title: '12 records', detail: '3 layers, most Vessel · aggregated' });
  });
});
