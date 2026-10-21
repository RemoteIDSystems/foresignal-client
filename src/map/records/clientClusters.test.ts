import type { StyleModel } from '../style/model';
import {
  CLUSTER_POINT_BUDGET,
  CLUSTER_RELEASE_POINTS,
  clusterStyle,
  pointCells,
  shouldCluster,
} from './clientClusters';
import { DEFAULT_AGGREGATION } from './hexCells';
import { tilePointToLonLat } from './tileMath';

/**
 * A cell of the local backend's `GET /v1/tiles/earthquake/3/1/3.mvt?agg=hex` (2026-10-21): its ring
 * in tile units (extent 4096), as the backend sent it.
 */
const BACKEND_TILE = { z: 3, x: 1, y: 3 };
const BACKEND_RING: [number, number][] = [
  [1024, 327],
  [1088, 216],
  [1216, 216],
  [1280, 327],
  [1216, 438],
  [1088, 438],
  [1024, 327],
];

/** Degrees a tile unit spans at zoom 3, about: the backend rounds its vertices to whole units. */
const UNIT_DEGREES = 360 / 8 / 4096;

describe('client clusters', () => {
  it('counts points into the backend’s own hexagon at the tile’s zoom', () => {
    const center = tilePointToLonLat(BACKEND_TILE, 4096, 1152, 327);
    const near = tilePointToLonLat(BACKEND_TILE, 4096, 1180, 300);
    const [cell, ...rest] = pointCells([center, near], 3);
    expect(rest).toEqual([]);
    expect(cell?.count).toBe(2);
    const expected = BACKEND_RING.map(([px, py]) => tilePointToLonLat(BACKEND_TILE, 4096, px, py));
    expect(cell?.ring).toHaveLength(expected.length);
    cell?.ring.forEach(([longitude, latitude], i) => {
      expect(Math.abs(longitude - expected[i]![0])).toBeLessThan(UNIT_DEGREES * 2);
      expect(Math.abs(latitude - expected[i]![1])).toBeLessThan(UNIT_DEGREES * 2);
    });
  });

  it('puts points in different hexagons apart, and keys cells by zoom and place', () => {
    const cells = pointCells(
      [
        [-122.8, 38.8],
        [-122.8, 38.8],
        [10, 50],
      ],
      3,
    );
    expect(cells.map((cell) => cell.count).sort()).toEqual([1, 2]);
    expect(new Set(cells.map((cell) => cell.key)).size).toBe(2);
    expect(cells.every((cell) => cell.key.startsWith('3:'))).toBe(true);
    // The same place at another zoom is another grid's cell.
    expect(pointCells([[10, 50]], 4)[0]?.key).not.toBe(cells.find((c) => c.count === 1)?.key);
  });

  it('leaves out points the projection cannot place', () => {
    expect(
      pointCells(
        [
          [0, 90],
          [0, -90],
        ],
        2,
      ),
    ).toEqual([]);
  });

  it('turns on past the budget and off only under the release, so it does not flicker', () => {
    expect(shouldCluster(CLUSTER_POINT_BUDGET, false)).toBe(false);
    expect(shouldCluster(CLUSTER_POINT_BUDGET + 1, false)).toBe(true);
    expect(shouldCluster(CLUSTER_RELEASE_POINTS, true)).toBe(true);
    expect(shouldCluster(CLUSTER_RELEASE_POINTS - 1, true)).toBe(false);
  });

  it('styles cells as the overlay style’s aggregated layers, or with the default ramp', () => {
    const aggregation = {
      layerId: 'aircraft--agg',
      tiles: [],
      countField: 'count',
      ramp: [
        [1, '#D0EBFF'],
        [1000, '#0B4B8C'],
      ] as [number, string][],
      opacity: 0.6,
      outlineColor: '#FFFFFF',
    };
    const model = {
      generatedAt: '',
      spriteUrl: '',
      layers: [{ id: 'earthquake' }, { id: 'aircraft', aggregation }],
    } as unknown as StyleModel;
    expect(clusterStyle(model)).toBe(aggregation);
    expect(clusterStyle({ ...model, layers: [] })).toBe(DEFAULT_AGGREGATION);
  });
});
