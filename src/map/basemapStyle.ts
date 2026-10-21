import {
  ArcGisMapServerImageryProvider,
  Credit,
  ImageryLayer,
  OpenStreetMapImageryProvider,
  UrlTemplateImageryProvider,
  type ImageryProvider,
} from 'cesium';
import { readStored, writeStored } from '../lib/storage';
import { DETAIL_FROM_ZOOM, OVERVIEW_BELOW_ZOOM } from './msaa';
import type { Attribution } from './style/attributionModel';

/**
 * The basemap the user picks: a street map or satellite imagery. Either one is the detailed
 * basemap past the hand-off zoom ({@link detailForZoom}); below it the NASA Marble overview shows
 * for both.
 */
export type BasemapStyle = 'map' | 'satellite';

/** The basemap a new browser starts with. */
export const DEFAULT_BASEMAP_STYLE: BasemapStyle = 'map';

/** Where this browser remembers the basemap the user picked. */
export const BASEMAP_STYLE_KEY = 'foresignal.basemapStyle';

/**
 * The detailed tile source drawn past the hand-off zoom: OpenStreetMap's own raster tiles (the
 * street map with no key), CARTO's dark raster street map (only with a key), or Esri World Imagery.
 */
export type DetailSource = 'osm' | 'carto' | 'esri';

/** OpenStreetMap's tile server, as Cesium's OpenStreetMap provider takes it. */
export const OSM_URL = 'https://tile.openstreetmap.org/';

/** CARTO's raster style for the street map: the dark one, to match the dark interface. */
export const CARTO_STYLE = 'dark_all';

/** CARTO's tile hosts, spread across for more requests at once. */
export const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'] as const;

/**
 * Esri World Imagery's map service. Cesium reads its metadata first: the tiling, the deepest level
 * and the service's own credit (`copyrightText`), so the credit on the map stays the service's.
 */
export const ESRI_WORLD_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';

/**
 * The deepest level of each detailed source, as far as it is known before its tiles are asked:
 * - OpenStreetMap's standard tiles stop at 19;
 * - CARTO's are held to the same level, as they draw the same OpenStreetMap data;
 * - Esri's service listed 24 levels (0–23) when read on 2026-10-21. Once the service's metadata is
 *   read, its own deepest level ({@link describeShown}) takes the place of this one.
 */
export const DETAIL_MAX_LEVELS: Readonly<Record<DetailSource, number>> = {
  osm: 19,
  carto: 19,
  esri: 23,
};

/**
 * Ground per pixel of a Web Mercator tile at `level`, in meters along the equator: the world's
 * circumference over its width in 256-pixel tiles.
 */
export function detailMetersPerPixel(level: number): number {
  return 40_075_016.686 / (256 * 2 ** level);
}

/**
 * The credit each detailed source asks for, shown on the map while it is drawn. Esri's is the
 * service's own `copyrightText` once it is read ({@link describeShown}); the text here is that
 * credit as it read on 2026-10-21, without its "Source: " prefix, for the About page and for the
 * moment before the service answers.
 */
export const DETAIL_ATTRIBUTIONS: Readonly<Record<DetailSource, Attribution>> = {
  osm: {
    text: '© OpenStreetMap contributors',
    licence: 'ODbL-1.0',
    url: 'https://www.openstreetmap.org/copyright',
    requiredDisplay: true,
  },
  carto: {
    text: '© OpenStreetMap contributors, © CARTO',
    licence: 'ODbL-1.0',
    url: 'https://carto.com/attribution',
    requiredDisplay: true,
  },
  esri: {
    text: 'Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    licence: 'Esri-terms',
    url: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9',
    requiredDisplay: true,
  },
};

/**
 * The overview's credit, shown on the map while the NASA Marble globe is all there is. NASA's
 * imagery is in the public domain, so its license asks for nothing; the credit is shown anyway.
 */
export const OVERVIEW_ATTRIBUTION: Attribution = {
  text: 'NASA Blue Marble, Black Marble',
  licence: 'US-PD',
  url: 'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation',
  requiredDisplay: false,
};

/** Whether `value` names a {@link BasemapStyle}. */
export function isBasemapStyle(value: unknown): value is BasemapStyle {
  return value === 'map' || value === 'satellite';
}

/** The basemap this browser last picked, else {@link DEFAULT_BASEMAP_STYLE}. */
export function readBasemapStyle(): BasemapStyle {
  const stored = readStored(BASEMAP_STYLE_KEY);
  return isBasemapStyle(stored) ? stored : DEFAULT_BASEMAP_STYLE;
}

/** Remembers the basemap picked, in this browser. */
export function writeBasemapStyle(style: BasemapStyle): void {
  writeStored(BASEMAP_STYLE_KEY, style);
}

/**
 * This build's CARTO key (`VITE_CARTO_KEY`), trimmed; undefined when unset or blank, which keeps
 * the street map on OpenStreetMap.
 */
export function cartoKey(
  raw: string | undefined = import.meta.env.VITE_CARTO_KEY,
): string | undefined {
  const key = raw?.trim();
  return key ? key : undefined;
}

/**
 * The detailed source for a basemap: Esri for satellite; for the street map CARTO with a key and
 * OpenStreetMap without one. CARTO answers every request without a key with an "API KEY REQUIRED"
 * tile, so it is never asked unkeyed.
 */
export function detailSourceFor(style: BasemapStyle, key: string | undefined): DetailSource {
  if (style === 'satellite') return 'esri';
  return key ? 'carto' : 'osm';
}

/**
 * CARTO's tile template with `key`, `{s}` standing for a subdomain, and the double-size tiles
 * where the screen draws two or more pixels to the CSS pixel.
 */
export function cartoTemplate(key: string, pixelRatio: number): string {
  const retina = pixelRatio >= 2 ? '@2x' : '';
  return (
    `https://{s}.basemaps.cartocdn.com/rastertiles/${CARTO_STYLE}/{z}/{x}/{y}${retina}.png` +
    `?key=${encodeURIComponent(key)}`
  );
}

/**
 * Whether the detailed basemap is drawn at map `zoom`, given whether it is now. The hand-off
 * follows the overview zoom of 005's adaptive MSAA: the overview below {@link OVERVIEW_BELOW_ZOOM},
 * the detailed basemap at or above {@link DETAIL_FROM_ZOOM}, and between them it stays as it is,
 * so a view resting near the crossing does not switch back and forth.
 */
export function detailForZoom(zoom: number, current: boolean): boolean {
  if (zoom < OVERVIEW_BELOW_ZOOM) return false;
  if (zoom >= DETAIL_FROM_ZOOM) return true;
  return current;
}

/** What a detailed provider needs to know beyond its source. */
export interface DetailOptions {
  /** The CARTO key; only the CARTO source reads it. */
  key?: string;
  /** The screen's device pixel ratio, for CARTO's double-size tiles. */
  pixelRatio?: number;
}

/**
 * A Cesium imagery provider for a detailed source, Web Mercator tiles. OpenStreetMap and CARTO are
 * made at once and stop at {@link DETAIL_MAX_LEVELS}; Esri is made from its service's metadata, so
 * it comes as a promise and takes the service's own deepest level and credit.
 */
export function createDetailProvider(
  source: DetailSource,
  { key, pixelRatio = 1 }: DetailOptions = {},
): ImageryProvider | Promise<ImageryProvider> {
  switch (source) {
    case 'osm':
      return new OpenStreetMapImageryProvider({
        url: OSM_URL,
        maximumLevel: DETAIL_MAX_LEVELS.osm,
        credit: new Credit(DETAIL_ATTRIBUTIONS.osm.text),
      });
    case 'carto':
      if (!key) throw new Error('CARTO tiles need a key; without one the street map is OSM.');
      return new UrlTemplateImageryProvider({
        url: cartoTemplate(key, pixelRatio),
        subdomains: [...CARTO_SUBDOMAINS],
        maximumLevel: DETAIL_MAX_LEVELS.carto,
        credit: new Credit(DETAIL_ATTRIBUTIONS.carto.text),
      });
    case 'esri':
      return ArcGisMapServerImageryProvider.fromUrl(ESRI_WORLD_IMAGERY_URL);
  }
}

/**
 * An imagery layer drawing a detailed source, made at once. For Esri the layer is ready only once
 * the service's metadata is read; until then it draws nothing and the overview shows through.
 */
export function createDetailLayer(source: DetailSource, options?: DetailOptions): ImageryLayer {
  const provider = createDetailProvider(source, options);
  return provider instanceof Promise
    ? ImageryLayer.fromProviderAsync(provider)
    : new ImageryLayer(provider);
}

/** The detailed basemap drawn now: its source, its credit and its deepest level. */
export interface ShownBasemap {
  source: DetailSource;
  /** The credit on the map: the provider's own, when it has one, else {@link DETAIL_ATTRIBUTIONS}. */
  attribution: Attribution;
  /** The deepest level its tiles go: the provider's, when known, else {@link DETAIL_MAX_LEVELS}. */
  maximumLevel: number;
}

/**
 * What `layer`, drawing `source`, shows: once the layer is ready, the credit and deepest level its
 * provider declares (for Esri, its service's `copyrightText` and levels); before, the defaults.
 */
export function describeShown(source: DetailSource, layer?: ImageryLayer): ShownBasemap {
  const provider = layer?.ready ? layer.imageryProvider : undefined;
  const credit = provider?.credit?.html.trim();
  const fallback = DETAIL_ATTRIBUTIONS[source];
  return {
    source,
    attribution: credit ? { ...fallback, text: credit } : fallback,
    maximumLevel: provider?.maximumLevel ?? DETAIL_MAX_LEVELS[source],
  };
}

/** Told when the basemap picked changes. */
type Listener = () => void;

/**
 * The basemap picked, shared by every map in the page and remembered in this browser: read once
 * from storage, written back on each change.
 */
export interface BasemapStyleStore {
  get(): BasemapStyle;
  set(style: BasemapStyle): void;
  subscribe(listener: Listener): () => void;
}

/** A {@link BasemapStyleStore} starting from what this browser remembers. */
export function createBasemapStyleStore(
  initial: BasemapStyle = readBasemapStyle(),
): BasemapStyleStore {
  let current = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => current,
    set(style) {
      if (style === current) return;
      current = style;
      writeBasemapStyle(style);
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The page's basemap choice. */
export const basemapStyleStore: BasemapStyleStore = createBasemapStyleStore();
