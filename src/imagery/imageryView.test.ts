import {
  AREA,
  BAND13,
  DISABLED,
  DOSSIER_IMAGERY,
  frame,
  GOES_VIS,
  MEDIA_ID,
  NOW,
  RADAR,
  SCENE,
  TRUECOLOR,
} from './testing/imageryFixtures';
import {
  bandOf,
  captionOf,
  defaultPair,
  dossierItem,
  durationMs,
  externalFrames,
  externalInstants,
  externalItem,
  externalTime,
  frameImageHref,
  frameLabel,
  imageryForTab,
  isComparable,
  isImageryProduct,
  matchesFilter,
  mediaIdOf,
  metersPerPixel,
  middleOf,
  mosaicUrls,
  newestFirst,
  productItem,
  rasterFrames,
  resolutionText,
  sceneItem,
  specOfUrl,
  tileOf,
  viewArea,
  type ImageryItem,
} from './imageryView';

describe('the imagery view', () => {
  it('reads a band from a name, and leaves the rest to All', () => {
    expect(bandOf(TRUECOLOR.title)).toBe('optical');
    expect(bandOf(GOES_VIS.title)).toBe('optical');
    expect(bandOf(BAND13.title)).toBe('thermal');
    expect(bandOf('Geo-Polar Blended SST')).toBe('thermal');
    expect(bandOf('Sentinel-1A SAR GRD')).toBe('sar');
    expect(bandOf('GOES-East water vapour (ABI band 8)')).toBeUndefined();
    expect(bandOf('GOES-East air mass RGB (GIBS)')).toBeUndefined();
  });

  it('reads ISO-8601 durations of days, hours and minutes', () => {
    expect(durationMs('P1D')).toBe(86_400_000);
    expect(durationMs('PT10M')).toBe(600_000);
    expect(durationMs('PT3H')).toBe(10_800_000);
    expect(durationMs('P')).toBeUndefined();
    expect(durationMs('weekly')).toBeUndefined();
    expect(durationMs(undefined)).toBeUndefined();
  });

  it('counts an external product’s instants back from its default lag, a step at a time', () => {
    expect(
      externalInstants(TRUECOLOR.external!, NOW, 3).map((at) => new Date(at).toISOString()),
    ).toEqual(['2026-10-19T00:00:00.000Z', '2026-10-18T00:00:00.000Z', '2026-10-17T00:00:00.000Z']);
    // Ten-minute frames are offered by the hour.
    expect(
      externalInstants(BAND13.external!, NOW, 2).map((at) => new Date(at).toISOString()),
    ).toEqual(['2026-10-20T11:20:00.000Z', '2026-10-20T10:20:00.000Z']);
    expect(externalTime('YYYY-MM-DD', Date.parse('2026-10-19T00:00:00Z'))).toBe('2026-10-19');
    expect(externalTime('YYYY-MM-DDThh:mm:ssZ', Date.parse('2026-10-20T11:20:00Z'))).toBe(
      '2026-10-20T11:20:00Z',
    );
  });

  it('writes resolutions as the mock does', () => {
    expect(resolutionText(0.31)).toBe('0.31 m');
    expect(resolutionText(10)).toBe('10 m');
    expect(resolutionText(2400)).toBe('2.4 km');
    expect(resolutionText(metersPerPixel(9), true)).toBe('≈ 306 m');
    expect(resolutionText(null)).toBe('—');
  });

  it('finds tiles, and lays a mosaic out around a point', () => {
    expect(tileOf(0, 0, 1)).toEqual({ x: 1, y: 1 });
    expect(tileOf(-180, 85.0511, 2)).toEqual({ x: 0, y: 0 });
    expect(tileOf(180, 0, 2).x).toBe(0);
    const rows = mosaicUrls(
      {
        type: 'tiles',
        template: 't/{time}/{z}/{y}/{x}',
        time: 'd',
        z: 1,
        longitude: 0,
        latitude: 0,
      },
      3,
    );
    // A world two tiles wide holds only a 2 × 2 mosaic.
    expect(rows).toEqual([
      ['t/d/1/0/0', 't/d/1/0/1'],
      ['t/d/1/1/0', 't/d/1/1/1'],
    ]);
    const wide = mosaicUrls(
      { type: 'tiles', template: '{z}/{y}/{x}', time: 'd', z: 3, longitude: -179, latitude: 0 },
      3,
    );
    // Columns wrap around the antimeridian.
    expect(wide[1]).toEqual(['3/4/7', '3/4/0', '3/4/1']);
  });

  it('fills a frame’s image template, and knows a media URL', () => {
    expect(frameImageHref('x?bbox={bbox}&width={width}&height={height}', AREA, 256, 160)).toBe(
      'x?bbox=-96,29,-94,31&width=256&height=160',
    );
    expect(mediaIdOf(`http://api.test/v1/media/${MEDIA_ID}/thumbnail?w=256`)).toBe(MEDIA_ID);
    expect(mediaIdOf(`/v1/media/${MEDIA_ID}`)).toBe(MEDIA_ID);
    expect(mediaIdOf('/v1/media/not-a-ulid')).toBeUndefined();
    expect(specOfUrl('https://example.test/a.png')).toEqual({
      type: 'url',
      url: 'https://example.test/a.png',
    });
    expect(specOfUrl(null)).toEqual({ type: 'none' });
  });

  it('takes imagery from satellite and imagery products the backend has not disabled', () => {
    expect([TRUECOLOR, BAND13, GOES_VIS, DISABLED, RADAR].filter(isImageryProduct)).toEqual([
      TRUECOLOR,
      BAND13,
      GOES_VIS,
    ]);
    expect(isComparable(TRUECOLOR)).toBe(true);
    expect(isComparable(GOES_VIS)).toBe(true);
    expect(
      isComparable({ ...TRUECOLOR, external: { ...TRUECOLOR.external!, timeDimension: null } }),
    ).toBe(false);
  });

  it('lists a product’s newest frame rendered for the view', () => {
    const item = productItem(GOES_VIS, frame('2026-10-20T11:50:00Z'), AREA);
    expect(item).toMatchObject({
      title: 'GOES-East visible (ABI band 2)',
      source: 'goes-east-abi',
      time: '2026-10-20T11:50:00Z',
      band: 'optical',
      satellite: true,
      origin: 'product',
      thumb: {
        type: 'product-image',
        href: 'http://api.test/v1/products/goes-east-vis/image/20261020T115000Z~abcdef12.png?bbox=-96,29,-94,31&width=256&height=160',
      },
    });
    expect(item.full).toMatchObject({ href: expect.stringContaining('width=1024&height=640') });
  });

  it('lists an external product’s latest instant over the view’s middle', () => {
    const item = externalItem(TRUECOLOR, AREA, NOW)!;
    expect(item).toMatchObject({
      key: 'external:gibs-viirs-noaa20-truecolor:2026-10-19',
      source: 'gibs',
      time: '2026-10-19T00:00:00.000Z',
      resolution: '≈ 306 m',
      band: 'optical',
      satellite: false,
      origin: 'external',
      thumb: { type: 'tiles', time: '2026-10-19', z: 5, longitude: -95, latitude: 30 },
      full: { type: 'tiles', z: 7 },
      attribution: 'Imagery: NASA EOSDIS Global Imagery Browse Services (GIBS)',
    });
    // Its zoom never passes the product's native one.
    expect(externalItem(BAND13, AREA, NOW)!.full).toMatchObject({ z: 6 });
  });

  it('lists a scene and a dossier’s imagery', () => {
    expect(sceneItem(SCENE)).toMatchObject({
      title: 'Sentinel-2B MSI L2A',
      source: 'ESA',
      time: '2026-10-19T16:55:00Z',
      resolution: '10 m',
      band: 'optical',
      origin: 'scene',
      thumb: { type: 'none' },
      ref: SCENE.ref,
    });
    expect(captionOf(sceneItem(SCENE))).toBe('10 m · Optical');
    expect(dossierItem(DOSSIER_IMAGERY.items[0]!)).toMatchObject({
      title: 'NOAA 19 AVHRR thermal infrared',
      source: 'satdump',
      band: 'thermal',
      satellite: true,
      origin: 'dossier',
      thumb: { type: 'media', mediaId: MEDIA_ID },
      full: { type: 'media', mediaId: MEDIA_ID },
    });
  });

  it('filters by band, sorts newest first, and lists nothing under Change Detection', () => {
    const items: ImageryItem[] = [
      sceneItem(SCENE),
      productItem(GOES_VIS, frame('2026-10-20T11:50:00Z'), AREA),
      externalItem(BAND13, AREA, NOW)!,
    ];
    expect(newestFirst(items).map((item) => item.origin)).toEqual(['product', 'external', 'scene']);
    expect(
      items.filter((item) => matchesFilter(item, 'thermal')).map((item) => item.origin),
    ).toEqual(['external']);
    expect(items.filter((item) => matchesFilter(item, 'change'))).toEqual([]);
    expect(items.filter((item) => matchesFilter(item, 'all'))).toHaveLength(3);
    expect(imageryForTab(items, 'area').map((item) => item.origin)).toEqual(['scene']);
    expect(imageryForTab(items, 'video')).toEqual([]);
  });

  it('widens a view to whole degrees and finds its middle across the antimeridian', () => {
    expect(viewArea([-95.4, 29.2, -94.6, 30.1])).toEqual([-96, 29, -94, 31]);
    expect(viewArea(undefined)).toEqual([-180, -90, 180, 90]);
    expect(middleOf([-96, 29, -94, 31])).toEqual({ longitude: -95, latitude: 30 });
    expect(middleOf([170, -10, -170, 10])).toEqual({ longitude: 180, latitude: 0 });
  });

  it('offers frames to compare, and opens a daily product a week apart', () => {
    const daily = externalFrames(TRUECOLOR, AREA, NOW);
    expect(daily).toHaveLength(30);
    expect(daily[0]).toMatchObject({
      time: '2026-10-19T00:00:00.000Z',
      spec: { time: '2026-10-19', z: 7 },
    });
    expect(defaultPair(daily, TRUECOLOR)).toEqual({
      before: '2026-10-12T00:00:00.000Z',
      after: '2026-10-19T00:00:00.000Z',
    });
    const raster = rasterFrames(
      [
        frame('2026-10-20T11:50:00Z'),
        frame('2026-10-20T11:45:00Z'),
        { ...frame('2026-10-20T11:40:00Z'), image: undefined },
      ],
      AREA,
    );
    expect(raster.map((entry) => entry.time)).toEqual([
      '2026-10-20T11:50:00Z',
      '2026-10-20T11:45:00Z',
    ]);
    expect(defaultPair(raster, GOES_VIS)).toEqual({
      before: '2026-10-20T11:45:00Z',
      after: '2026-10-20T11:50:00Z',
    });
    expect(defaultPair(raster.slice(0, 1), GOES_VIS)).toBeUndefined();
    expect(frameLabel('2026-10-19T00:00:00.000Z', true)).toBe('2026-10-19');
    expect(frameLabel('2026-10-20T11:50:00Z', false)).toBe('2026-10-20 11:50Z');
  });
});
