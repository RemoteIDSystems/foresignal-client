// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { terrainUrl } from './terrain';

const terrainDir = fileURLToPath(new URL('../../public/terrain/', import.meta.url));

interface LayerJson {
  format: string;
  scheme: string;
  projection: string;
  tiles: string[];
  extensions?: string[];
  maxzoom: number;
  available: Array<Array<{ startX: number; startY: number; endX: number; endY: number }>>;
}

describe('terrain', () => {
  it('is served from the app origin under the base URL', () => {
    expect(terrainUrl('/')).toBe('/terrain/');
    expect(terrainUrl('/app')).toBe('/app/terrain/');
  });

  const layer = JSON.parse(readFileSync(`${terrainDir}layer.json`, 'utf8')) as LayerJson;

  it('declares quantized-mesh in the geographic TMS scheme, without vertex normals', () => {
    expect(layer).toMatchObject({
      format: 'quantized-mesh-1.0',
      scheme: 'tms',
      projection: 'EPSG:4326',
      tiles: ['{z}/{x}/{y}.terrain'],
    });
    // Normals would turn off the day/night blend that keeps the night lights on the night side.
    expect(layer.extensions ?? []).toEqual([]);
    expect(layer.available).toHaveLength(layer.maxzoom + 1);
  });

  it('ships every tile that layer.json declares, and no deeper level', () => {
    layer.available.forEach(([range], level) => {
      expect(range).toEqual({
        startX: 0,
        startY: 0,
        endX: 2 ** (level + 1) - 1,
        endY: 2 ** level - 1,
      });
      const columns = readdirSync(`${terrainDir}${level}`);
      expect(columns).toHaveLength(2 ** (level + 1));
      for (const x of columns) {
        expect(readdirSync(`${terrainDir}${level}/${x}`)).toHaveLength(2 ** level);
      }
    });
    expect(() => readdirSync(`${terrainDir}${layer.maxzoom + 1}`)).toThrow();
  });
});
