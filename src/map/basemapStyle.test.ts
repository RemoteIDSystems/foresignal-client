import { OpenStreetMapImageryProvider, UrlTemplateImageryProvider } from 'cesium';
import {
  BASEMAP_STYLE_KEY,
  cartoKey,
  cartoTemplate,
  createBasemapStyleStore,
  createDetailProvider,
  DETAIL_ATTRIBUTIONS,
  DETAIL_MAX_LEVEL,
  detailForZoom,
  detailSourceFor,
  ESRI_WORLD_IMAGERY_TEMPLATE,
  readBasemapStyle,
} from './basemapStyle';
import { DETAIL_FROM_ZOOM, OVERVIEW_BELOW_ZOOM } from './msaa';

afterEach(() => localStorage.clear());

describe('detailSourceFor', () => {
  it('draws OpenStreetMap for the map without a key, and never CARTO unkeyed', () => {
    expect(detailSourceFor('map', undefined)).toBe('osm');
    expect(detailSourceFor('map', cartoKey(''))).toBe('osm');
    expect(detailSourceFor('map', cartoKey('   '))).toBe('osm');
  });

  it('draws CARTO for the map only with a key', () => {
    expect(detailSourceFor('map', cartoKey(' k3y '))).toBe('carto');
    expect(cartoKey(' k3y ')).toBe('k3y');
  });

  it('draws Esri World Imagery for satellite, key or not', () => {
    expect(detailSourceFor('satellite', undefined)).toBe('esri');
    expect(detailSourceFor('satellite', 'k3y')).toBe('esri');
  });
});

describe('cartoTemplate', () => {
  it('asks for the dark raster style with the key, on every subdomain', () => {
    expect(cartoTemplate('a b&c', 1)).toBe(
      'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=a%20b%26c',
    );
  });

  it('asks for double-size tiles on a screen of two or more pixels to the CSS pixel', () => {
    expect(cartoTemplate('k', 2)).toContain('/{z}/{x}/{y}@2x.png?key=k');
    expect(cartoTemplate('k', 3)).toContain('@2x.png');
    expect(cartoTemplate('k', 1.5)).not.toContain('@2x');
  });
});

describe('createDetailProvider', () => {
  it('makes the keyless street map from OpenStreetMap', () => {
    const provider = createDetailProvider('osm');
    expect(provider).toBeInstanceOf(OpenStreetMapImageryProvider);
    expect((provider as UrlTemplateImageryProvider).url).toContain(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    );
    expect(provider.maximumLevel).toBe(DETAIL_MAX_LEVEL);
    expect(provider.credit.html).toBe('© OpenStreetMap contributors');
  });

  it('makes CARTO with its key and subdomains, and refuses it without a key', () => {
    const provider = createDetailProvider('carto', { key: 'k3y', pixelRatio: 2 });
    const url = (provider as UrlTemplateImageryProvider).url;
    expect(url).toContain('basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png');
    expect(url).toContain('key=k3y');
    expect(provider.credit.html).toBe('© OpenStreetMap contributors, © CARTO');
    expect(() => createDetailProvider('carto')).toThrow(/need a key/);
  });

  it('makes Esri World Imagery from its XYZ tiles, with no key', () => {
    const provider = createDetailProvider('esri');
    expect((provider as UrlTemplateImageryProvider).url).toBe(ESRI_WORLD_IMAGERY_TEMPLATE);
    expect(provider.credit.html).toBe(
      'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    );
  });
});

describe('DETAIL_ATTRIBUTIONS', () => {
  it('credits each detailed source on the map', () => {
    for (const attribution of Object.values(DETAIL_ATTRIBUTIONS)) {
      expect(attribution.requiredDisplay).toBe(true);
      expect(attribution.url).toMatch(/^https:\/\//);
    }
    expect(DETAIL_ATTRIBUTIONS.carto.text).toContain('© CARTO');
    expect(DETAIL_ATTRIBUTIONS.osm.text).not.toContain('CARTO');
  });
});

describe('detailForZoom', () => {
  it('hands off at the overview zoom of the adaptive MSAA, with the same dead band', () => {
    expect(detailForZoom(OVERVIEW_BELOW_ZOOM - 0.01, true)).toBe(false);
    expect(detailForZoom(DETAIL_FROM_ZOOM, false)).toBe(true);
    // Between the two, it keeps what it has.
    const between = (OVERVIEW_BELOW_ZOOM + DETAIL_FROM_ZOOM) / 2;
    expect(detailForZoom(between, false)).toBe(false);
    expect(detailForZoom(between, true)).toBe(true);
    expect(detailForZoom(0, false)).toBe(false);
    expect(detailForZoom(18, false)).toBe(true);
  });
});

describe('the basemap choice', () => {
  it('starts on the map, and on what this browser picked before', () => {
    expect(readBasemapStyle()).toBe('map');
    localStorage.setItem(BASEMAP_STYLE_KEY, 'satellite');
    expect(readBasemapStyle()).toBe('satellite');
    localStorage.setItem(BASEMAP_STYLE_KEY, 'terrain');
    expect(readBasemapStyle()).toBe('map');
  });

  it('is remembered when picked, and tells its listeners once per change', () => {
    const store = createBasemapStyleStore('map');
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.set('satellite');
    store.set('satellite');
    expect(store.get()).toBe('satellite');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(BASEMAP_STYLE_KEY)).toBe('satellite');
    expect(createBasemapStyleStore().get()).toBe('satellite');
    stop();
    store.set('map');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
