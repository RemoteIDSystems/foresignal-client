import { json, standInApi } from '../intel/testing/standIn';
import {
  getMediaBlob,
  getMediaMeta,
  getMediaThumbnailBlob,
  getProductImageBlob,
  loadComparisonFrames,
  loadRecentImagery,
} from './imageryApi';
import {
  AREA,
  BAND13,
  DISABLED,
  DOSSIER_IMAGERY,
  frame,
  GOES_VIS,
  MEDIA,
  MEDIA_ID,
  NOW,
  RADAR,
  SCENE,
  TRUECOLOR,
} from './testing/imageryFixtures';

/** A PNG answer. */
const png = () => new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 });

/** The products, the newest GOES frame, and the scenes, as a backend with imagery answers. */
const BACKEND = {
  'GET /v1/products': () =>
    json({ items: [TRUECOLOR, BAND13, GOES_VIS, DISABLED, RADAR], nextCursor: null }),
  'GET /v1/products/goes-east-vis/frames/latest': () => json(frame('2026-10-20T11:50:00Z')),
  'GET /v1/sensors': () =>
    json({
      from: '2026-10-13T12:00:00Z',
      to: '2026-10-20T12:00:00Z',
      items: [SCENE],
      note: 'Foresignal cannot task public satellites or third-party sensors',
    }),
};

describe('the imagery reads', () => {
  it('lists recent imagery from frames, external products and scenes, newest first', async () => {
    const { api, asked } = standInApi(BACKEND);
    const { items, failures } = await loadRecentImagery(api, { area: AREA, now: NOW });
    expect(failures).toEqual([]);
    expect(items.map((item) => item.key)).toEqual([
      'product:goes-east-vis:20261020T115000Z~abcdef12',
      'external:gibs-goes-east-band13:2026-10-20T11:20:00Z',
      'scene:sensor:scene:S2B_MSIL2A_20261019',
      'external:gibs-viirs-noaa20-truecolor:2026-10-19',
    ]);
    // Only the enabled raster product is asked for its frame; scenes are the last seven days.
    expect(asked).not.toContain('GET /v1/products/goes-west-ir/frames/latest');
    const scenes = new URL(
      `http://x${asked.find((line) => line.startsWith('GET /v1/sensors'))!.slice(4)}`,
    ).searchParams;
    expect(scenes.get('kinds')).toBe('scene');
    expect(scenes.get('bbox')).toBe('-96,29,-94,31');
    expect(scenes.get('from')).toBe('2026-10-13T12:00:00.000Z');
  });

  it('puts the selected object’s dossier imagery in, and names a source that failed', async () => {
    const { api } = standInApi({
      ...BACKEND,
      [`GET /v1/objects/${encodeURIComponent(DOSSIER_IMAGERY.items[0]!.ref)}/dossier`]: () =>
        json({ sections: { imagery: DOSSIER_IMAGERY } }),
      'GET /v1/sensors': () =>
        json({ title: 'Bad Request', status: 400, detail: 'Window too long.' }, 400),
    });
    const { items, failures } = await loadRecentImagery(api, {
      area: AREA,
      now: NOW,
      ref: DOSSIER_IMAGERY.items[0]!.ref,
    });
    expect(items.map((item) => item.origin)).toEqual([
      'product',
      'dossier',
      'external',
      'external',
    ]);
    expect(failures).toEqual([expect.stringMatching(/^Scenes: .*Window too long\./)]);
  });

  it('leaves out a product with no frame yet', async () => {
    const { api } = standInApi({
      ...BACKEND,
      'GET /v1/products/goes-east-vis/frames/latest': () =>
        json({ title: 'Not Found', status: 404, code: 'UNKNOWN_FRAME' }, 404),
    });
    const { items, failures } = await loadRecentImagery(api, { area: AREA, now: NOW });
    expect(items.some((item) => item.origin === 'product')).toBe(false);
    expect(failures).toEqual([]);
  });

  it('fetches media, thumbnails, rows and product images through the client', async () => {
    const { api, asked } = standInApi({
      [`GET /v1/media/${MEDIA_ID}`]: png,
      [`GET /v1/media/${MEDIA_ID}/thumbnail`]: png,
      [`GET /v1/media/${MEDIA_ID}/meta`]: () => json(MEDIA),
      'GET /v1/products/goes-east-vis/image/20261020T115000Z~abcdef12.png': png,
    });
    expect(await getMediaBlob(api, MEDIA_ID)).toBeInstanceOf(Blob);
    expect(await getMediaThumbnailBlob(api, MEDIA_ID, 256)).toBeInstanceOf(Blob);
    expect((await getMediaMeta(api, MEDIA_ID)).width).toBe(2048);
    const href =
      'http://api.test/v1/products/goes-east-vis/image/20261020T115000Z~abcdef12.png?bbox=-96,29,-94,31&width=256&height=160';
    expect(await getProductImageBlob(api, href)).toBeInstanceOf(Blob);
    expect(asked).toEqual([
      `GET /v1/media/${MEDIA_ID}`,
      `GET /v1/media/${MEDIA_ID}/thumbnail?w=256`,
      `GET /v1/media/${MEDIA_ID}/meta`,
      expect.stringMatching(
        /^GET \/v1\/products\/goes-east-vis\/image\/20261020T115000Z~abcdef12\.png\?bbox=/,
      ),
    ]);
    await expect(getProductImageBlob(api, 'https://elsewhere.test/a.png')).rejects.toThrow(
      'Not a product image URL',
    );
  });

  it('offers an external product’s instants without asking, and a raster product’s frames', async () => {
    const { api, asked } = standInApi({
      'GET /v1/products/goes-east-vis/frames': () =>
        json({
          items: [frame('2026-10-20T11:45:00Z'), frame('2026-10-20T11:50:00Z')],
          nextCursor: null,
        }),
    });
    expect(await loadComparisonFrames(api, TRUECOLOR, AREA, NOW)).toHaveLength(30);
    expect(asked).toEqual([]);
    const frames = await loadComparisonFrames(api, GOES_VIS, AREA, NOW);
    expect(frames.map((entry) => entry.time)).toEqual([
      '2026-10-20T11:50:00Z',
      '2026-10-20T11:45:00Z',
    ]);
    const query = new URL(`http://x${asked[0]!.slice(4)}`).searchParams;
    expect(query.get('from')).toBe('2026-10-17T12:00:00.000Z');
    expect(query.get('to')).toBe('2026-10-20T12:00:00.000Z');
  });
});
