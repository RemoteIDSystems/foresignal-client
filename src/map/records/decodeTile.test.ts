// @vitest-environment node
import { readFileSync } from 'node:fs';
import { decodeTile } from './decodeTile';
import { encodeTile } from './testing/encodeTile';

/** A real tile: USGS earthquakes over northern California, as the live backend served it. */
const live = readFileSync(new URL('./fixtures/usgs-earthquakes-5-5-12.mvt', import.meta.url));

describe('decodeTile', () => {
  it('reads every record of a live tile in degrees, with its properties', () => {
    const features = decodeTile(live, { z: 5, x: 5, y: 12 });
    expect(features).toHaveLength(182);
    const first = features[0]!;
    expect(first.layer).toBe('usgs-earthquakes');
    expect(first.properties).toMatchObject({
      kind: 'earthquake',
      source: 'usgs-earthquakes',
      place: '6 km WNW of The Geysers, CA',
      mag: 1.1,
    });
    expect(first.geometry.type).toBe('point');
    const [lon, lat] = first.geometry.type === 'point' ? first.geometry.points[0]! : [0, 0];
    // The Geysers is at about 122.76° W, 38.78° N; "6 km WNW" puts it just west and north of it.
    expect(Math.abs(lon - -122.76)).toBeLessThan(0.1);
    expect(Math.abs(lat - 38.78)).toBeLessThan(0.1);
    expect(lon).toBeLessThan(-122.76);
    expect(features.every((f) => f.properties.kind === 'earthquake')).toBe(true);
  });

  it('decodes an empty body to no features', () => {
    expect(decodeTile(new ArrayBuffer(0), { z: 0, x: 0, y: 0 })).toEqual([]);
  });

  it('drops points in the tile buffer so a neighbor does not draw them twice', () => {
    const tile = encodeTile([
      {
        name: 'pts',
        features: [
          { type: 'point', geometry: [[[2048, 2048]]], properties: { n: 'inside' } },
          { type: 'point', geometry: [[[-10, 2048]]], properties: { n: 'west buffer' } },
          { type: 'point', geometry: [[[4096, 100]]], properties: { n: 'east edge' } },
        ],
      },
    ]);
    const features = decodeTile(tile, { z: 0, x: 0, y: 0 });
    expect(features.map((f) => f.properties.n)).toEqual(['inside']);
    expect(features[0]?.geometry).toEqual({ type: 'point', points: [[0, 0]] });
  });

  it('decodes lines and polygons with holes, one entry per layer feature', () => {
    const tile = encodeTile([
      {
        name: 'cables',
        features: [
          {
            type: 'line',
            geometry: [
              [
                [0, 2048],
                [4096, 2048],
              ],
              [
                [2048, 0],
                [2048, 4096],
              ],
            ],
            properties: { kind: 'cable' },
          },
        ],
      },
      {
        name: 'areas',
        features: [
          {
            type: 'polygon',
            geometry: [
              [
                [1024, 1024],
                [3072, 1024],
                [3072, 3072],
                [1024, 3072],
                [1024, 1024],
              ],
              [
                [1536, 1536],
                [1536, 2560],
                [2560, 2560],
                [2560, 1536],
                [1536, 1536],
              ],
            ],
            properties: { kind: 'zone', live: true },
          },
        ],
      },
    ]);
    const [line, area] = decodeTile(tile, { z: 0, x: 0, y: 0 });
    expect(line?.layer).toBe('cables');
    expect(line?.geometry.type === 'line' && line.geometry.lines).toEqual([
      [
        [-180, 0],
        [180, 0],
      ],
      [
        [0, expect.closeTo(85.0511, 4)],
        [0, expect.closeTo(-85.0511, 4)],
      ],
    ]);
    expect(area?.properties).toEqual({ kind: 'zone', live: true });
    expect(area?.geometry.type).toBe('polygon');
    const polygons = area?.geometry.type === 'polygon' ? area.geometry.polygons : [];
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toHaveLength(2);
    expect(polygons[0]?.[0]).toHaveLength(5);
    expect(polygons[0]?.[0]?.[0]).toEqual([-90, expect.closeTo(66.5133, 4)]);
  });
});
