import {
  CesiumTerrainProvider,
  type Cartographic,
  type TerrainData,
  type TileAvailability,
  type TilingScheme,
} from 'cesium';

/**
 * URL of the self-hosted terrain (quantized-mesh tiles and `layer.json` under `public/terrain`, see
 * its README for the source and how it is built). `base` is the app's base URL; Vite's `BASE_URL`
 * by default.
 */
export function terrainUrl(base: string = import.meta.env.BASE_URL): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}terrain/`;
}

/**
 * Loads the terrain provider: NOAA ETOPO 2022 relief (land and seafloor). Cesium raises it in 3D and
 * draws it flat in 2D; the readout reads its height in both through a {@link TerrainSampler}.
 *
 * The tiles carry no vertex normals. With normals, Cesium switches the globe from day/night shading
 * to per-vertex lighting, and only day/night shading limits the night-lights layer to the night
 * side; with them the lights covered the whole globe. Slopes still read in 3D from the raised
 * geometry and the shaded relief in the Blue Marble imagery.
 */
export function createTerrainProvider(base?: string): Promise<CesiumTerrainProvider> {
  return CesiumTerrainProvider.fromUrl(terrainUrl(base));
}

/** The parts of a terrain provider that {@link TerrainSampler} uses; matches Cesium's. */
export interface SampledTerrain {
  /** The provider's tiling scheme. */
  tilingScheme: Pick<TilingScheme, 'positionToTileXY' | 'tileXYToRectangle'>;
  /** Which tiles exist, by level. */
  availability: Pick<TileAvailability, 'computeMaximumLevelAtPosition'> | undefined;
  /** Loads one tile's terrain data. */
  requestTileGeometry(x: number, y: number, level: number): Promise<TerrainData> | undefined;
}

/**
 * Reads ground elevation from the terrain itself, at the most detailed level available, for the
 * readout. It does not read the rendered globe: what is drawn depends on zoom (and in 2D the
 * globe's own height query reads the flattened mesh), but the readout must not.
 *
 * {@link heightAt} answers synchronously from tiles already fetched and starts fetching a missing
 * tile, so a caller that asks every frame gets the height a moment later. Up to {@link limit} tiles
 * are kept, least recently used dropped first.
 */
export class TerrainSampler {
  private readonly tiles = new Map<string, TerrainData | 'loading' | 'failed'>();

  /** @param terrain The terrain to read. @param limit Tiles to keep. */
  constructor(
    private readonly terrain: SampledTerrain,
    private readonly limit = 64,
  ) {}

  /** Height in meters at a point, or undefined until its tile has loaded (or if it failed). */
  heightAt(point: Cartographic): number | undefined {
    const level = this.terrain.availability?.computeMaximumLevelAtPosition(point) ?? 0;
    const xy = this.terrain.tilingScheme.positionToTileXY(point, level);
    if (!xy) return undefined;
    const key = `${level}/${xy.x}/${xy.y}`;
    const entry = this.tiles.get(key);
    if (entry === undefined) {
      this.load(key, xy.x, xy.y, level);
      return undefined;
    }
    if (typeof entry === 'string') return undefined;
    this.tiles.delete(key);
    this.tiles.set(key, entry);
    const rectangle = this.terrain.tilingScheme.tileXYToRectangle(xy.x, xy.y, level);
    return entry.interpolateHeight(rectangle, point.longitude, point.latitude);
  }

  /** Starts loading one tile and records the result. */
  private load(key: string, x: number, y: number, level: number): void {
    const request = this.terrain.requestTileGeometry(x, y, level);
    if (!request) return; // throttled: asked again next frame
    this.tiles.set(key, 'loading');
    request.then(
      (data) => {
        this.tiles.set(key, data);
        while (this.tiles.size > this.limit) {
          const oldest = this.tiles.keys().next().value;
          if (oldest === undefined) break;
          this.tiles.delete(oldest);
        }
      },
      () => this.tiles.set(key, 'failed'),
    );
  }
}
