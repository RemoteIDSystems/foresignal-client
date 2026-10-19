import { Credit, GeographicTilingScheme, ImageryLayer, UrlTemplateImageryProvider } from 'cesium';

/** Highest tile level present in `public/basemap` (16384 × 8192 px for the world). */
export const BASEMAP_MAX_LEVEL = 5;

/**
 * Brightness for the night layer. With day/night shading on, Cesium lights the night side at 0.3
 * (`diffuseIntensity` floor in `@cesium/engine` `GlobeFS.glsl`), which would show the Black Marble
 * lights at 30% of the source. Scaling by 1 / 0.3 shows them as NASA published them.
 */
export const NIGHT_BRIGHTNESS = 1 / 0.3;

/** The two basemap products, each a tile pyramid under `public/basemap`. */
export const BASEMAPS = {
  /** NASA Blue Marble: Next Generation (September 2004), daytime true color. */
  day: { directory: 'blue-marble', credit: 'NASA Blue Marble: Next Generation' },
  /** NASA Black Marble 2016, night lights. */
  night: { directory: 'black-marble', credit: 'NASA Black Marble 2016' },
} as const;

/** Which half of the day/night basemap. */
export type BasemapKey = keyof typeof BASEMAPS;

/**
 * URL template for one basemap's tiles, served from the client's own origin (`public/basemap`, see
 * its README for sources). `base` is the app's base URL; Vite's `BASE_URL` by default.
 */
export function basemapTemplate(key: BasemapKey, base: string = import.meta.env.BASE_URL): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}basemap/${BASEMAPS[key].directory}/{z}/{x}/{y}.webp`;
}

/** An imagery provider for one basemap: geographic tiling, levels 0–{@link BASEMAP_MAX_LEVEL}. */
function basemapProvider(key: BasemapKey): UrlTemplateImageryProvider {
  return new UrlTemplateImageryProvider({
    url: basemapTemplate(key),
    tilingScheme: new GeographicTilingScheme(),
    maximumLevel: BASEMAP_MAX_LEVEL,
    credit: new Credit(BASEMAPS[key].credit),
  });
}

/**
 * The base imagery: Blue Marble everywhere, with Black Marble night lights over it on the night
 * side only. The night layer's `dayAlpha` is 0, so with the globe's lighting on, Cesium fades
 * from day to night across the terminator; {@link NIGHT_BRIGHTNESS} undoes the night-side shading
 * so the lights keep their published brightness. Returned bottom first; add them in this order.
 */
export function createBaseLayers(): [day: ImageryLayer, night: ImageryLayer] {
  const day = new ImageryLayer(basemapProvider('day'));
  const night = new ImageryLayer(basemapProvider('night'), {
    dayAlpha: 0,
    nightAlpha: 1,
    brightness: NIGHT_BRIGHTNESS,
  });
  return [day, night];
}

/** The two level-0 Blue Marble tiles (west, east) for the global-view inset background. */
export function insetTileUrls(base?: string): [string, string] {
  const template = basemapTemplate('day', base).replace('{z}', '0').replace('{y}', '0');
  return [template.replace('{x}', '0'), template.replace('{x}', '1')];
}
