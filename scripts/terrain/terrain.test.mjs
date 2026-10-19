// @vitest-environment node
import { Cartesian3, Ellipsoid, EllipsoidalOccluder } from 'cesium';
import {
  decodeTile,
  encodeTile,
  highWaterMarkDecode,
  highWaterMarkEncode,
  QUANTIZED_MAX,
  reorderForHighWaterMark,
  zigZagDeltaDecode,
  zigZagDeltaEncode,
} from './quantized-mesh.mjs';
import {
  buildTile,
  ElevationGrid,
  farHorizonPoint,
  gridForSpacing,
  levelGeometricError,
  pyramid,
  tileRectangle,
} from './tiles.mjs';

/** A 1°-cell world that is flat at `base` meters except for a cone peaking at (lon, lat). */
function coneWorld({ base = 0, peak = 5000, lon = 10, lat = 20, radius = 8 } = {}) {
  const width = 360;
  const height = 180;
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(-180 + x + 0.5 - lon, 90 - y - 0.5 - lat);
      data[y * width + x] = base + Math.max(0, peak * (1 - d / radius));
    }
  }
  return new ElevationGrid(width, height, data);
}

describe('quantized-mesh encoding', () => {
  it('zig-zag delta round-trips, including steps down', () => {
    const values = Uint16Array.from([0, 5, 2, 32767, 0, 16000]);
    expect(zigZagDeltaEncode(values).slice(0, 3)).toEqual(Uint16Array.from([0, 10, 5]));
    expect(zigZagDeltaDecode(zigZagDeltaEncode(values))).toEqual(values);
  });

  it('high-water-mark round-trips and rejects an index out of order', () => {
    const triangles = Uint32Array.from([0, 1, 2, 2, 1, 3, 3, 4, 0]);
    expect(highWaterMarkEncode(triangles)).toEqual(Uint32Array.from([0, 0, 0, 1, 2, 0, 1, 0, 5]));
    expect(highWaterMarkDecode(highWaterMarkEncode(triangles))).toEqual(triangles);
    expect(() => highWaterMarkEncode(Uint32Array.from([1, 0, 2]))).toThrow();
  });

  it('renumbers vertices in first-use order', () => {
    const { newToOld, triangles } = reorderForHighWaterMark(
      4,
      Uint32Array.from([3, 1, 2, 2, 1, 0]),
    );
    expect(newToOld).toEqual(Uint32Array.from([3, 1, 2, 0]));
    expect(triangles).toEqual(Uint32Array.from([0, 1, 2, 2, 1, 3]));
  });
});

describe('terrain tiles', () => {
  const levels = pyramid(coneWorld(), 45);

  it('lays out level 0 as two 180° tiles with TMS rows from the south', () => {
    expect(tileRectangle(0, 0, 0)).toEqual({ west: -180, south: -90, east: 0, north: 90 });
    expect(tileRectangle(3, 9, 5)).toEqual({ west: 22.5, south: 22.5, east: 45, north: 45 });
  });

  it('matches Cesium’s geometric error and samples the pyramid level that fits', () => {
    expect(levelGeometricError(0)).toBeCloseTo(77067.34, 2);
    expect(levelGeometricError(6)).toBeCloseTo(77067.34 / 64, 2);
    expect(levels.map((l) => l.width)).toEqual([360, 180, 90, 45]);
    expect(gridForSpacing(levels, 1.5).cell).toBe(1);
    expect(gridForSpacing(levels, 2.5).cell).toBe(2);
  });

  // The tile holding the cone: level 3, 22.5° tiles; the peak (10°E, 20°N) is in column 8, row 4.
  const built = buildTile(levels, 3, 8, 4, 50);
  const tile = decodeTile(encodeTile(built));
  const rect = tileRectangle(3, 8, 4);
  const lonLat = (i) => [
    rect.west + (tile.u[i] / QUANTIZED_MAX) * (rect.east - rect.west),
    rect.south + (tile.v[i] / QUANTIZED_MAX) * (rect.north - rect.south),
  ];
  const meters = (i) =>
    tile.minimumHeight +
    (tile.height[i] / QUANTIZED_MAX) * (tile.maximumHeight - tile.minimumHeight);

  it('round-trips through the decoder exactly', () => {
    expect(tile.u).toEqual(built.u);
    expect(tile.v).toEqual(built.v);
    expect(tile.height).toEqual(built.height);
    expect(tile.triangles).toEqual(built.triangles);
    expect(tile.extensions).toEqual({});
    expect(tile.center).toEqual(built.center);
  });

  it('keeps the cone: the highest vertex is at the peak, the corners on the flat', () => {
    expect(tile.minimumHeight).toBe(0);
    const top = tile.height.indexOf(QUANTIZED_MAX);
    const [lon, lat] = lonLat(top);
    expect(Math.hypot(lon - 10, lat - 20)).toBeLessThan(1);
    expect(meters(top)).toBeGreaterThan(4500);
    expect(tile.u.length).toBeLessThan(65 * 65);
  });

  it('winds every triangle counter-clockwise in east/north', () => {
    for (let t = 0; t < tile.triangles.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => tile.triangles[t + k]);
      const cross =
        (tile.u[b] - tile.u[a]) * (tile.v[c] - tile.v[a]) -
        (tile.v[b] - tile.v[a]) * (tile.u[c] - tile.u[a]);
      expect(cross).toBeGreaterThan(0);
    }
  });

  it('lists exactly the vertices on each edge', () => {
    const on = (test) => [...tile.u.keys()].filter(test);
    expect([...tile.edges.west]).toEqual(on((i) => tile.u[i] === 0));
    expect([...tile.edges.east]).toEqual(on((i) => tile.u[i] === QUANTIZED_MAX));
    expect([...tile.edges.south]).toEqual(on((i) => tile.v[i] === 0));
    expect([...tile.edges.north]).toEqual(on((i) => tile.v[i] === QUANTIZED_MAX));
    expect(tile.edges.west.length).toBeGreaterThanOrEqual(2);
  });

  it('puts every vertex inside the bounding sphere', () => {
    const [cx, cy, cz, radius] = tile.boundingSphere;
    for (let i = 0; i < tile.u.length; i++) {
      const [lon, lat] = lonLat(i);
      const p = Cartesian3.fromDegrees(lon, lat, meters(i));
      expect(Cartesian3.distance(p, new Cartesian3(cx, cy, cz))).toBeLessThanOrEqual(radius + 1);
    }
  });
});

describe('horizon culling of hemisphere tiles', () => {
  const levels = pyramid(coneWorld(), 45);
  // Level 0 is two 180° tiles, too wide for Cesium to compute a horizon point, so the header's is used.
  const east = decodeTile(encodeTile(buildTile(levels, 0, 1, 0, 50)));
  const occluder = new EllipsoidalOccluder(Ellipsoid.WGS84);
  const seenFrom = (lon, lat, height) => {
    occluder.cameraPosition = Cartesian3.fromDegrees(lon, lat, height);
    return occluder.isScaledSpacePointVisiblePossiblyUnderEllipsoid(
      new Cartesian3(...east.horizonOcclusionPoint),
      east.minimumHeight,
    );
  };

  it('points along the rectangle center, not the bounding sphere center', () => {
    const [x, y, z] = east.horizonOcclusionPoint;
    expect(new Cartesian3(x, y, z)).toEqual(farHorizonPoint(tileRectangle(0, 1, 0)));
    expect(Math.abs(x) / Math.hypot(x, y, z)).toBeLessThan(1e-9);
    expect(Math.abs(z) / Math.hypot(x, y, z)).toBeLessThan(1e-9);
  });

  it('keeps the tile from a low camera anywhere over it or within sight of its edge', () => {
    // At 70 km the horizon is about 8.5° away; 180°E is the tile's edge.
    for (const lat of [-80, -45, 0, 45, 80]) {
      for (const lon of [90, 150, 170.5, 179.9, 184, 187]) {
        expect(seenFrom(lon, lat, 70_000), `${lon}, ${lat}`).toBe(true);
      }
    }
  });

  it('culls the tile from a low camera on the far side of the Earth', () => {
    expect(seenFrom(-90, 0, 70_000)).toBe(false);
    expect(seenFrom(-160, 30, 70_000)).toBe(false);
  });
});
