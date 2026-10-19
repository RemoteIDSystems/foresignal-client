import { buildModuleUrl, ImageryLayer, TileMapServiceImageryProvider } from 'cesium';

/**
 * URL of Cesium's bundled Natural Earth II tiles. They ship inside the build (Cesium `Assets`),
 * so the base map needs no third-party service and no Cesium ion token.
 */
export function naturalEarthUrl(): string {
  return buildModuleUrl('Assets/Textures/NaturalEarthII');
}

/**
 * The base imagery layer: bundled Natural Earth II, dimmed to sit under the dark theme. The
 * backend's map style is overlay-only (no basemap), so the base layer is the client's.
 */
export function createBaseLayer(): ImageryLayer {
  return ImageryLayer.fromProviderAsync(TileMapServiceImageryProvider.fromUrl(naturalEarthUrl()), {
    brightness: 0.62,
    contrast: 1.15,
    saturation: 0.75,
    gamma: 1.05,
  });
}

/** The two level-0 Natural Earth tiles (west, east) for the global-view inset background. */
export function insetTileUrls(): [string, string] {
  const base = naturalEarthUrl();
  return [`${base}/0/0/0.jpg`, `${base}/0/1/0.jpg`];
}
