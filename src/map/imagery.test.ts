// @vitest-environment node
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BASEMAP_MAX_LEVEL,
  BASEMAPS,
  basemapTemplate,
  createBaseLayers,
  insetTileUrls,
} from './imagery';

const publicDir = fileURLToPath(new URL('../../public/basemap/', import.meta.url));

describe('basemap', () => {
  it('serves both products from the app origin under the base URL', () => {
    expect(basemapTemplate('day', '/')).toBe('/basemap/blue-marble/{z}/{x}/{y}.webp');
    expect(basemapTemplate('night', '/app')).toBe('/app/basemap/black-marble/{z}/{x}/{y}.webp');
  });

  it('uses the level-0 Blue Marble tiles for the inset', () => {
    expect(insetTileUrls('/')).toEqual([
      '/basemap/blue-marble/0/0/0.webp',
      '/basemap/blue-marble/0/1/0.webp',
    ]);
  });

  it('shows Blue Marble by day and Black Marble lights only at night', () => {
    const [day, night] = createBaseLayers();
    expect([day.dayAlpha, day.nightAlpha]).toEqual([1, 1]);
    expect([night.dayAlpha, night.nightAlpha]).toEqual([0, 1]);
    expect(night.brightness * 0.3).toBeCloseTo(1, 10);
    expect(day.brightness).toBe(1);
  });

  it.each(Object.values(BASEMAPS))(
    'ships every tile of $directory up to the max level',
    ({ directory }) => {
      for (let z = 0; z <= BASEMAP_MAX_LEVEL; z++) {
        const columns = readdirSync(`${publicDir}${directory}/${z}`);
        expect(columns).toHaveLength(2 ** (z + 1));
        for (const x of columns) {
          const rows = readdirSync(`${publicDir}${directory}/${z}/${x}`);
          expect(rows.sort()).toEqual(Array.from({ length: 2 ** z }, (_, y) => `${y}.webp`).sort());
          expect(statSync(`${publicDir}${directory}/${z}/${x}/0.webp`).size).toBeGreaterThan(0);
        }
      }
      expect(() => readdirSync(`${publicDir}${directory}/${BASEMAP_MAX_LEVEL + 1}`)).toThrow();
    },
  );
});
