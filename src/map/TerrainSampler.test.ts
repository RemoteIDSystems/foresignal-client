import { Cartesian2, Cartographic, GeographicTilingScheme, type TerrainData } from 'cesium';
import { TerrainSampler, type SampledTerrain } from './terrain';

/** A terrain whose every tile is a plane at `level × 1000 + x` meters, with request control. */
function fakeTerrain(maxLevel = 6) {
  const tilingScheme = new GeographicTilingScheme();
  const requests: string[] = [];
  const pending: Array<() => void> = [];
  const terrain: SampledTerrain = {
    tilingScheme,
    availability: { computeMaximumLevelAtPosition: () => maxLevel },
    requestTileGeometry(x, y, level) {
      requests.push(`${level}/${x}/${y}`);
      return new Promise<TerrainData>((resolve) =>
        pending.push(() =>
          resolve({ interpolateHeight: () => level * 1000 + x } as unknown as TerrainData),
        ),
      );
    },
  };
  const flush = async () => {
    pending.splice(0).forEach((resolve) => resolve());
    await Promise.resolve();
  };
  return { terrain, requests, flush, tilingScheme };
}

describe('TerrainSampler', () => {
  const denver = Cartographic.fromDegrees(-104.99, 39.74);

  it('fetches the most detailed tile once, then answers from it', async () => {
    const { terrain, requests, flush, tilingScheme } = fakeTerrain(6);
    const sampler = new TerrainSampler(terrain);
    expect(sampler.heightAt(denver)).toBeUndefined();
    expect(sampler.heightAt(denver)).toBeUndefined();
    const xy = tilingScheme.positionToTileXY(denver, 6, new Cartesian2());
    expect(requests).toEqual([`6/${xy.x}/${xy.y}`]);
    await flush();
    expect(sampler.heightAt(denver)).toBe(6000 + xy.x);
    expect(requests).toHaveLength(1);
  });

  it('asks again later when the provider throttles a request', () => {
    const { terrain } = fakeTerrain();
    let calls = 0;
    const sampler = new TerrainSampler({
      ...terrain,
      requestTileGeometry: () => (calls++, undefined),
    });
    sampler.heightAt(denver);
    sampler.heightAt(denver);
    expect(calls).toBe(2);
  });

  it('keeps only the most recently used tiles', async () => {
    const { terrain, requests, flush } = fakeTerrain(6);
    const sampler = new TerrainSampler(terrain, 2);
    const points = [-100, -80, -60].map((lon) => Cartographic.fromDegrees(lon, 0));
    points.forEach((p) => sampler.heightAt(p));
    await flush();
    expect(sampler.heightAt(points[2]!)).toBeDefined();
    sampler.heightAt(points[0]!); // evicted: fetched again
    expect(requests).toHaveLength(4);
  });

  it('reads nothing from a tile that failed to load', async () => {
    const { terrain } = fakeTerrain();
    const sampler = new TerrainSampler({
      ...terrain,
      requestTileGeometry: () => Promise.reject(new Error('404')),
    });
    sampler.heightAt(denver);
    await Promise.resolve();
    await Promise.resolve();
    expect(sampler.heightAt(denver)).toBeUndefined();
  });
});
