import { createForesignalClient } from '../../api/client';
import { FsError } from '../../api/errors';
import { http, MOCK_BASE_URL, server } from '../../api/testing/mock-server';
import fixture from './fixtures/overlay-style.json';
import spriteIndex from './fixtures/sprite-index.json';
import { loadMapIcon, loadOverlayStyle } from './loadOverlayStyle';
import type { MapStyle } from './parseStyle';
import { SpriteSheet, type SpriteIndex } from './sprite';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const style = fixture as unknown as MapStyle;
const api = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });
/** Stands in for canvas decoding, which jsdom lacks; records what it was given. */
const decodeSprite = vi.fn(
  async (index: SpriteIndex, png: Blob, ratio: number) =>
    new SpriteSheet(index, new Uint8Array((await png.arrayBuffer()).byteLength), 1, ratio),
);

afterEach(() => decodeSprite.mockClear());

describe('loadOverlayStyle', () => {
  it('requests the style for the theme and layers, then the sprite by file name at the device ratio', async () => {
    const requests: string[] = [];
    server.use(
      http.get('/v1/map/style.json', ({ request, response }) => {
        requests.push(new URL(request.url).search);
        return response(200).json(style);
      }),
      http.get('/v1/map/sprites/{spriteFile}', ({ params, request, response }) => {
        requests.push(`${params.spriteFile} ${request.headers.get('Accept')}`);
        if (params.spriteFile.endsWith('.json')) {
          return response(200).json(spriteIndex as SpriteIndex);
        }
        return response.untyped(
          new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { 'Content-Type': 'image/png' },
          }),
        );
      }),
    );
    const overlay = await loadOverlayStyle(api(), {
      theme: 'dark',
      layers: ['acled', 'adsbfi-mil'],
      pixelRatio: 2,
      decodeSprite,
    });
    expect(requests[0]).toBe('?theme=dark&layers=acled%2Cadsbfi-mil');
    expect(requests.slice(1).sort()).toEqual([
      'foresignal-1b0f0988@2x.json application/json, application/problem+json',
      'foresignal-1b0f0988@2x.png image/png',
    ]);
    expect(overlay.model.kinds).toContain('conflict-event');
    expect(decodeSprite).toHaveBeenCalledOnce();
    const [index, png, ratio] = decodeSprite.mock.calls[0] ?? [];
    expect(index).toEqual(spriteIndex);
    expect(png?.size).toBe(4);
    expect(ratio).toBe(2);
    expect(overlay.sprite?.has('danger')).toBe(true);
  });

  it('uses the 1× sprite on a standard display', async () => {
    const files: string[] = [];
    server.use(
      http.get('/v1/map/style.json', ({ response }) => response(200).json(style)),
      http.get('/v1/map/sprites/{spriteFile}', ({ params, response }) => {
        files.push(params.spriteFile);
        return params.spriteFile.endsWith('.json')
          ? response(200).json(spriteIndex as SpriteIndex)
          : response.untyped(
              new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/png' } }),
            );
      }),
    );
    await loadOverlayStyle(api(), { theme: 'light', pixelRatio: 1, decodeSprite });
    expect(files.sort()).toEqual(['foresignal-1b0f0988.json', 'foresignal-1b0f0988.png']);
  });

  it('keeps the style when the sprite fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server.use(
      http.get('/v1/map/style.json', ({ response }) => response(200).json(style)),
      http.get('/v1/map/sprites/{spriteFile}', ({ response }) =>
        response(404).json({ type: 'about:blank', title: 'Not Found', status: 404 }),
      ),
    );
    const overlay = await loadOverlayStyle(api(), { theme: 'dark', decodeSprite });
    expect(overlay.sprite).toBeUndefined();
    expect(overlay.model.layers).toHaveLength(6);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('throws an FsError when the style fails', async () => {
    server.use(
      http.get('/v1/map/style.json', ({ response }) =>
        response(400).json({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: 'unknown layer',
        }),
      ),
    );
    await expect(
      loadOverlayStyle(api(), { theme: 'dark', layers: ['nope'] }),
    ).rejects.toBeInstanceOf(FsError);
  });
});

describe('loadMapIcon', () => {
  it('fetches the single icon as an image', async () => {
    let accept: string | null = null;
    server.use(
      http.get('/v1/map/icons/{name}.png', ({ params, request, response }) => {
        accept = request.headers.get('Accept');
        expect(params.name).toBe('volcano');
        return response.untyped(
          new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/png' } }),
        );
      }),
    );
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:icon');
    expect(await loadMapIcon(api(), 'volcano')).toBe('blob:icon');
    expect((created.mock.calls[0]?.[0] as Blob).size).toBe(2);
    expect(accept).toBe('image/png');
    created.mockRestore();
  });
});
