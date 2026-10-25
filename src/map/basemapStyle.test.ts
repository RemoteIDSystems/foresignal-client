import {
  ArcGisMapServerImageryProvider,
  Credit,
  ImageryLayer,
  UrlTemplateImageryProvider,
  type ImageryProvider,
} from 'cesium';
import {
  BASEMAP_STYLE_KEY,
  cartoKey,
  cartoTemplate,
  createBasemapStyleStore,
  createDetailProvider,
  createDetailLayer,
  describeShown,
  DETAIL_ATTRIBUTIONS,
  DETAIL_MAX_LEVELS,
  detailForZoom,
  detailMetersPerPixel,
  detailSourceFor,
  ESRI_DARK_GRAY_TEMPLATE,
  ESRI_WORLD_IMAGERY_URL,
  readBasemapStyle,
} from './basemapStyle';
import { DETAIL_FROM_ZOOM, OVERVIEW_BELOW_ZOOM } from './msaa';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('detailSourceFor', () => {
  it('draws Esri Dark Gray for the map without a key, and never CARTO unkeyed', () => {
    expect(detailSourceFor('map', undefined)).toBe('esri-dark');
    expect(detailSourceFor('map', cartoKey(''))).toBe('esri-dark');
    expect(detailSourceFor('map', cartoKey('   '))).toBe('esri-dark');
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
  it('makes the keyless street map from Esri Dark Gray, stopping where its real tiles stop', () => {
    const provider = createDetailProvider('esri-dark') as ImageryProvider;
    expect(provider).toBeInstanceOf(UrlTemplateImageryProvider);
    expect((provider as UrlTemplateImageryProvider).url).toBe(ESRI_DARK_GRAY_TEMPLATE);
    expect(ESRI_DARK_GRAY_TEMPLATE).toMatch(
      /World_Dark_Gray_Base\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/,
    );
    expect(provider.maximumLevel).toBe(16);
    expect(provider.credit.html).toContain('© OpenStreetMap contributors');
  });

  it('makes CARTO with its key and subdomains, and refuses it without a key', () => {
    const provider = createDetailProvider('carto', {
      key: 'k3y',
      pixelRatio: 2,
    }) as ImageryProvider;
    const url = (provider as UrlTemplateImageryProvider).url;
    expect(url).toContain('basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png');
    expect(url).toContain('key=k3y');
    expect(provider.maximumLevel).toBe(DETAIL_MAX_LEVELS.carto);
    expect(provider.credit.html).toBe('© OpenStreetMap contributors, © CARTO');
    expect(() => createDetailProvider('carto')).toThrow(/need a key/);
  });

  it('makes Esri World Imagery from its map service, which declares its own levels and credit', () => {
    const provider = new UrlTemplateImageryProvider({ url: 'https://esri.test/{z}/{y}/{x}' });
    const fromUrl = vi
      .spyOn(ArcGisMapServerImageryProvider, 'fromUrl')
      .mockResolvedValue(provider as unknown as ArcGisMapServerImageryProvider);
    const made = createDetailProvider('esri');
    expect(made).toBeInstanceOf(Promise);
    expect(fromUrl).toHaveBeenCalledWith(ESRI_WORLD_IMAGERY_URL);
    // A layer is made at once and draws once the service has answered.
    const layer = createDetailLayer('esri');
    expect(layer).toBeInstanceOf(ImageryLayer);
    expect(fromUrl).toHaveBeenCalledTimes(2);
  });
});

describe('describeShown', () => {
  it("uses the service's own credit and deepest level once the layer is ready", () => {
    const layer = {
      ready: true,
      imageryProvider: {
        credit: new Credit(
          'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
        ),
        maximumLevel: 23,
      },
    } as unknown as ImageryLayer;
    const shown = describeShown('esri', layer);
    expect(shown.source).toBe('esri');
    expect(shown.attribution).toEqual({
      ...DETAIL_ATTRIBUTIONS.esri,
      text: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    });
    expect(shown.maximumLevel).toBe(23);
  });

  it('falls back to the known credit and level before the layer is ready', () => {
    const layer = { ready: false } as unknown as ImageryLayer;
    expect(describeShown('esri', layer)).toEqual({
      source: 'esri',
      attribution: DETAIL_ATTRIBUTIONS.esri,
      maximumLevel: DETAIL_MAX_LEVELS.esri,
    });
    expect(describeShown('esri-dark').maximumLevel).toBe(16);
  });
});

describe('detailMetersPerPixel', () => {
  it('measures a Web Mercator pixel at the equator', () => {
    expect(detailMetersPerPixel(0)).toBeCloseTo(40_075_016.686 / 256, 6);
    // OpenStreetMap's level 19: about 0.3 m a pixel.
    expect(detailMetersPerPixel(19)).toBeCloseTo(0.2986, 4);
  });
});

describe('DETAIL_ATTRIBUTIONS', () => {
  it('credits each detailed source on the map', () => {
    for (const attribution of Object.values(DETAIL_ATTRIBUTIONS)) {
      expect(attribution.requiredDisplay).toBe(true);
      expect(attribution.url).toMatch(/^https:\/\//);
    }
    expect(DETAIL_ATTRIBUTIONS.carto.text).toContain('© CARTO');
    expect(DETAIL_ATTRIBUTIONS['esri-dark'].text).not.toContain('CARTO');
    // The service's credit as read on 2026-10-21, for the About page and until it answers.
    expect(DETAIL_ATTRIBUTIONS.esri.text).toBe(
      'Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    );
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
