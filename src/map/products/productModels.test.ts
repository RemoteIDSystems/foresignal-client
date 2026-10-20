// @vitest-environment node
import { Rectangle, Math as CesiumMath } from 'cesium';
import { barbParts } from './barbGlyph';
import { mercatorSourceRow } from './loopImage';
import { ParticleSystem, TRAIL_LENGTH, wrapLongitude } from './particles';
import type { Product, ProductLegend } from './productApi';
import {
  categoryDefaultKeys,
  defaultProductLayers,
  productEntries,
  rowKeys,
} from './productCatalog';
import { parseProductLayerKey, productLayerKey } from './productLayers';
import { formatTime, legendBar } from './productLegendModel';
import { boundsRectangle } from './productTiles';
import { WindField } from './windField';

describe('barbParts', () => {
  it('rounds to 5 kt and splits into pennants, full and half barbs', () => {
    expect(barbParts(2)).toEqual({ calm: true, pennants: 0, full: 0, half: 0 });
    expect(barbParts(5)).toEqual({ calm: false, pennants: 0, full: 0, half: 1 });
    expect(barbParts(23)).toEqual({ calm: false, pennants: 0, full: 2, half: 1 });
    expect(barbParts(65)).toEqual({ calm: false, pennants: 1, full: 1, half: 1 });
    expect(barbParts(103)).toEqual({ calm: false, pennants: 2, full: 0, half: 1 });
  });
});

describe('mercatorSourceRow', () => {
  it('maps the edges to the edges and the middle latitude north of the middle row', () => {
    expect(mercatorSourceRow(-0.5, 100, -60, 60)).toBeCloseTo(-0.5);
    expect(mercatorSourceRow(99.5, 100, -60, 60)).toBeCloseTo(99.5);
    expect(mercatorSourceRow(49.5, 100, -60, 60)).toBeCloseTo(49.5);
    // 30° N in a 0..60° box is the middle row in latitude, but further south in Mercator.
    expect(mercatorSourceRow(49.5, 100, 0, 60)).toBeGreaterThan(55);
  });
});

describe('boundsRectangle', () => {
  it('keeps bounds inside Web Mercator', () => {
    const scheme = Rectangle.fromDegrees(-180, -85.0511287798066, 180, 85.0511287798066);
    const r = boundsRectangle([-130, -90, -60, 90], scheme);
    expect(CesiumMath.toDegrees(r.west)).toBeCloseTo(-130);
    expect(CesiumMath.toDegrees(r.north)).toBeCloseTo(85.0511, 3);
    expect(boundsRectangle(undefined, scheme)).toEqual(scheme);
  });
});

/** A 4 × 3 png-uv field whose u is the column and v the row (0..255 over ±40 m/s). */
function field(bounds: number[]) {
  const pixels = new Uint8ClampedArray(4 * 3 * 4);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 4; x++) pixels.set([x * 85, y * 127.5, 0, 255], (y * 4 + x) * 4);
  }
  return new WindField(pixels, 4, 3, {
    uMin: -40,
    uMax: 40,
    vMin: -40,
    vMax: 40,
    width: 4,
    height: 3,
    bounds,
  });
}

describe('WindField', () => {
  it('decodes u and v at grid points and interpolates between them', () => {
    const f = field([0, -90, 270, 90]);
    expect(f.sample(0, 90)![0]).toBeCloseTo(-40);
    expect(f.sample(0, 90)![1]).toBeCloseTo(-40);
    expect(f.sample(270, -90)![0]).toBeCloseTo(40);
    expect(f.sample(45, 0)![0]).toBeCloseTo((-40 + -40 + 80 / 3) / 2, 0);
    expect(f.sample(0, 0)![1]).toBeCloseTo(0, 0);
  });

  it('wraps a full-circle field and answers negative longitudes', () => {
    const f = field([0, -90, 359, 90]);
    expect(f.sample(-90, 0)).toEqual(f.sample(270, 0));
    expect(f.sample(359.5, 0)).toBeDefined();
    expect(field([-100, 0, -60, 40]).sample(0, 20)).toBeUndefined();
  });
});

describe('ParticleSystem', () => {
  /** Numbers in [0, 1) from a fixed sequence, so particles are placed the same every run. */
  const seeded = () => {
    let seed = 7;
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  };

  it('moves particles with the wind at a speed in screen pixels, keeping a trail', () => {
    const east = { sample: () => [10, 0] as [number, number] };
    const system = new ParticleSystem(east, 20, seeded());
    system.setRect({ west: -50, south: -10, east: 50, north: 10 });
    const before = system.particles.map((p) => [p.longitude, p.latitude, p.age, p.life]);
    system.step(1, 0.1);
    system.particles.forEach((p, i) => {
      const [lon, lat, age, life] = before[i]!;
      if (age! + 1 > life! || lon! + 5 / Math.cos((lat! * Math.PI) / 180) > 50) return;
      // 10 m/s × 5 px per m/s × 0.1° per px, widened by the latitude.
      expect(p.longitude - lon!).toBeCloseTo(5 / Math.cos((lat! * Math.PI) / 180));
      expect(p.speed).toBe(10);
      expect(p.trail.length).toBeGreaterThan(1);
    });
    // A point every 1/15 s: within a second of 60 frames the trail is full.
    for (let i = 0; i < 60; i++) system.step(1 / 60, 0.001);
    expect(Math.max(...system.particles.map((p) => p.trail.length))).toBe(TRAIL_LENGTH);
  });

  it('restarts particles where the field has no wind, inside the view', () => {
    const none = { sample: () => undefined };
    const system = new ParticleSystem(none, 10, seeded());
    system.setRect({ west: 170, south: 0, east: -170, north: 10 });
    system.step(1, 1);
    for (const p of system.particles) {
      expect(p.longitude >= 170 || p.longitude <= -170).toBe(true);
      expect(p.trail).toHaveLength(1);
    }
  });

  it('wraps longitudes', () => {
    expect(wrapLongitude(190)).toBe(-170);
    expect(wrapLongitude(-181)).toBe(179);
  });
});

describe('product layer keys', () => {
  it('name a product’s raster, barbs and particles', () => {
    expect(productLayerKey('gfs', 'raster')).toBe('gfs');
    expect(productLayerKey('gfs', 'barbs')).toBe('gfs:barbs');
    expect(parseProductLayerKey('gfs:particles')).toEqual({
      productId: 'gfs',
      facet: 'particles',
    });
    expect(parseProductLayerKey('mrms-reflectivity')).toEqual({
      productId: 'mrms-reflectivity',
      facet: 'raster',
    });
  });
});

/** A catalog product, as `listProducts` gives it. */
const product = (
  id: string,
  kind: Product['kind'],
  category: Product['category'],
  health: 'healthy' | 'disabled' = 'healthy',
) =>
  ({
    id,
    title: id.toUpperCase(),
    kind,
    category,
    source: id,
    status: { health, stale: false, reason: health === 'disabled' ? 'source disabled' : null },
  }) as Product;

describe('productEntries', () => {
  const products = [
    product('mrms-reflectivity', 'raster', 'radar'),
    product('goes-east-ir', 'raster', 'satellite', 'disabled'),
    product('gfs', 'field', 'model'),
    product('gibs-goes-east-band13', 'external', 'satellite'),
    product('sst-geopolar', 'raster', 'imagery'),
  ];

  it('lists the backend’s products under the rail’s categories, leaving out external ones', () => {
    const entries = productEntries(products);
    expect(entries.map((e) => [e.id, e.category, e.available])).toEqual([
      ['mrms-reflectivity', 'weather', true],
      ['goes-east-ir', 'weather', false],
      ['gfs', 'weather', true],
      ['sst-geopolar', 'imagery', true],
    ]);
    expect(entries[1]!.reason).toBe('source disabled');
  });

  it('turns on the curated products that can be drawn, a wind field with speed and particles', () => {
    const entries = productEntries(products);
    expect(defaultProductLayers(entries)).toEqual(['mrms-reflectivity']);
    expect(categoryDefaultKeys(entries, 'weather')).toEqual(['mrms-reflectivity']);
    expect(categoryDefaultKeys(entries, 'imagery')).toEqual([]);
    expect(rowKeys({ id: 'gfs', field: true })).toEqual(['gfs', 'gfs:particles']);
  });
});

describe('legendBar', () => {
  const base = { styleId: 's', styleVersion: 1 };

  it('draws a continuous legend as a gradient placed by value, with its ticks', () => {
    const bar = legendBar({
      ...base,
      type: 'continuous',
      stops: [
        { value: 0, color: '#000000' },
        { value: 10, color: '#ff0000' },
        { value: 40, color: '#ffffff' },
      ],
      ticks: [
        { value: 0, label: '0' },
        { value: 20, label: '20' },
        { value: 40, label: '40' },
      ],
    } as ProductLegend);
    expect(bar).toEqual({
      type: 'gradient',
      background: 'linear-gradient(to right, #000000 0%, #ff0000 25%, #ffffff 100%)',
      ticks: [
        { at: 0, label: '0' },
        { at: 50, label: '20' },
        { at: 100, label: '40' },
      ],
    });
  });

  it('draws a discrete legend as bands and a categorical one as labels', () => {
    expect(
      legendBar({
        ...base,
        type: 'discrete',
        stops: [
          { value: 10, color: '#00ff00', label: '10' },
          { value: 5, color: '#0000ff' },
        ],
      } as ProductLegend),
    ).toEqual({
      type: 'bands',
      bands: [
        { color: '#0000ff', label: '5' },
        { color: '#00ff00', label: '10' },
      ],
    });
    expect(
      legendBar({
        ...base,
        type: 'categorical',
        categories: [{ code: 1, color: '#123456', label: 'Extreme' }],
      } as ProductLegend),
    ).toEqual({ type: 'categories', items: [{ color: '#123456', label: 'Extreme' }] });
    expect(legendBar({ ...base, type: 'continuous', stops: [] } as ProductLegend)).toBe(undefined);
  });

  it('formats a frame time in UTC', () => {
    expect(formatTime('2026-10-20T13:05:00Z')).toBe('Oct 20 13:05Z');
  });
});
