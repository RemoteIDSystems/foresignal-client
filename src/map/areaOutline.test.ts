// @vitest-environment node
import { outlineParts } from './areaOutline';

describe('outlineParts', () => {
  it('outlines polygons by their rings, lines as lines and points as points', () => {
    expect(
      outlineParts({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        ],
      }),
    ).toEqual([
      {
        type: 'ring',
        coordinates: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      },
    ]);
    expect(outlineParts({ type: 'Point', coordinates: [5, 6] })).toEqual([
      { type: 'point', coordinates: [[5, 6]] },
    ]);
    expect(
      outlineParts({
        type: 'LineString',
        coordinates: [
          [0, 0],
          [2, 2],
        ],
      }),
    ).toEqual([
      {
        type: 'line',
        coordinates: [
          [0, 0],
          [2, 2],
        ],
      },
    ]);
  });

  it('skips malformed positions and draws nothing for no geometry', () => {
    expect(
      outlineParts({
        type: 'LineString',
        coordinates: [[0, 0], ['x', 1], [2]],
      }),
    ).toEqual([{ type: 'line', coordinates: [[0, 0]] }]);
    expect(outlineParts(null)).toEqual([]);
  });
});
