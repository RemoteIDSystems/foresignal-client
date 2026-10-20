// @vitest-environment node
import fixture from '../style/fixtures/overlay-style.json';
import { parseOverlayStyle, type MapStyle } from '../style/parseStyle';
import type { RecordFeature } from './decodeTile';
import { aggregationFor, cellKey, cellsOfTile, HexCellIndex, rampColor } from './hexCells';

const model = parseOverlayStyle(fixture as unknown as MapStyle);

/** A hexagon around a center, closed, as a decoded tile gives it. */
function hexagon(lon: number, lat: number, size = 1): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    ring.push([lon + size * Math.cos(angle), lat + size * Math.sin(angle)]);
  }
  ring.push(ring[0]!);
  return ring;
}

const cell = (lon: number, lat: number, count: unknown): RecordFeature => ({
  layer: 'aircraft',
  properties: { agg: 'hex', count: count as number, kinds: '{"aircraft": 1}' },
  geometry: { type: 'polygon', polygons: [[hexagon(lon, lat)]] },
});

describe('cellsOfTile', () => {
  it('reads each counted polygon as a cell, skipping the rest', () => {
    const cells = cellsOfTile([
      cell(10, 20, 5),
      cell(12, 20, 0),
      cell(14, 20, 'many'),
      { layer: 'x', properties: { count: 3 }, geometry: { type: 'point', points: [[0, 0]] } },
    ]);
    expect(cells.map((c) => [c.key, c.count])).toEqual([['10.00000,20.00000', 5]]);
  });
});

describe('cellKey', () => {
  it('is the center, whether or not the ring is closed', () => {
    const ring = hexagon(-3.25, 51.5);
    expect(cellKey(ring)).toBe('-3.25000,51.50000');
    expect(cellKey(ring.slice(0, -1))).toBe('-3.25000,51.50000');
  });
});

describe('HexCellIndex', () => {
  it('merges a cell two tiles both send, summing their counts', () => {
    const index = new HexCellIndex();
    index.set('2/0/1', cellsOfTile([cell(10, 20, 5), cell(30, 20, 1)]));
    // The neighbor carries the same straddling cell, counting its own side.
    index.set('2/1/1', cellsOfTile([cell(10, 20, 3)]));
    expect(
      index
        .merged()
        .map((c) => [c.key, c.count])
        .sort(),
    ).toEqual([
      ['10.00000,20.00000', 8],
      ['30.00000,20.00000', 1],
    ]);
    index.delete('2/0/1');
    expect(index.merged().map((c) => c.count)).toEqual([3]);
    expect(index.tiles()).toEqual(['2/1/1']);
  });
});

describe('aggregationFor', () => {
  it('takes the kind’s aggregation style from a source layer that has one', () => {
    expect(aggregationFor(model, 'aircraft')?.ramp[0]).toEqual([1, '#1C3D5A']);
    expect(aggregationFor(model, 'conflict-event')).toBeUndefined();
  });
});

describe('rampColor', () => {
  const ramp: [number, string][] = [
    [1, '#000000'],
    [11, '#FF8000'],
  ];

  it('interpolates between stops and holds at the ends', () => {
    expect(rampColor(ramp, 0)).toBe('#000000');
    expect(rampColor(ramp, 6)).toBe('#804000');
    expect(rampColor(ramp, 500)).toBe('#FF8000');
  });
});
