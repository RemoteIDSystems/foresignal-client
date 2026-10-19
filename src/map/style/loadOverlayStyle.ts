import { unwrap, type ForesignalClient } from '../../api/client';
import type { StyleModel } from './model';
import { parseOverlayStyle } from './parseStyle';
import { SpriteSheet, spriteFileName, type SpriteIndex } from './sprite';

/** The overlay style, parsed, with its sprite when the sprite loaded. */
export interface OverlayStyle {
  model: StyleModel;
  /** The decoded sprite; undefined when it failed to load (icons then come from `getMapIcon`). */
  sprite?: SpriteSheet;
}

/** Options for {@link loadOverlayStyle}. */
export interface LoadOverlayStyleOptions {
  /** Color theme for line and fill defaults. */
  theme: 'light' | 'dark';
  /** Tile layer ids to style; omitted, the backend styles every source layer the caller may read. */
  layers?: readonly string[];
  /** Device pixel ratio; 1.5 and above loads the `@2x` sprite. */
  pixelRatio?: number;
  /** Decodes a sprite sheet; defaults to {@link SpriteSheet.decode}. Tests replace it. */
  decodeSprite?: (index: SpriteIndex, png: Blob, pixelRatio: number) => Promise<SpriteSheet>;
}

/**
 * Loads the backend's overlay style (`getMapStyle`) and its sprite (`getMapSprite`, index and
 * sheet) and parses them into an {@link OverlayStyle}.
 *
 * The sprite is requested by file name through the API client rather than at the style's absolute
 * `sprite` URL, so it goes to the client's own backend URL with its credentials. A style that fails
 * to load throws an `FsError`; a sprite that fails is logged and left out, and the legend falls back
 * to the single-icon endpoint.
 */
export async function loadOverlayStyle(
  api: ForesignalClient,
  options: LoadOverlayStyleOptions,
): Promise<OverlayStyle> {
  const query: { theme: 'light' | 'dark'; layers?: string } = { theme: options.theme };
  if (options.layers) query.layers = options.layers.join(',');
  const style = await unwrap(api.GET('/v1/map/style.json', { params: { query } }));
  const model = parseOverlayStyle(style);
  const ratio: 1 | 2 = (options.pixelRatio ?? 1) >= 1.5 ? 2 : 1;
  try {
    const sprite = await loadSprite(api, model.spriteUrl, ratio, options.decodeSprite);
    return sprite ? { model, sprite } : { model };
  } catch (error) {
    console.warn(
      'ForeSignal: the map sprite did not load; legend icons use the icon endpoint.',
      error,
    );
    return { model };
  }
}

/** Loads and decodes one sprite at a pixel ratio; undefined when the URL is not a sprite name. */
async function loadSprite(
  api: ForesignalClient,
  spriteUrl: string,
  ratio: 1 | 2,
  decode: LoadOverlayStyleOptions['decodeSprite'] = SpriteSheet.decode,
): Promise<SpriteSheet | undefined> {
  const indexFile = spriteFileName(spriteUrl, ratio, 'json');
  const sheetFile = spriteFileName(spriteUrl, ratio, 'png');
  if (!indexFile || !sheetFile) return undefined;
  const [index, sheet] = await Promise.all([
    unwrap(
      api.GET('/v1/map/sprites/{spriteFile}', { params: { path: { spriteFile: indexFile } } }),
    ),
    unwrap(
      api.GET('/v1/map/sprites/{spriteFile}', {
        params: { path: { spriteFile: sheetFile } },
        headers: { Accept: 'image/png' },
        parseAs: 'blob',
      }),
    ),
  ]);
  return decode(index as SpriteIndex, sheet as unknown as Blob, ratio);
}

/**
 * Loads one 32 px icon (`getMapIcon`) as an object URL, for icons the sprite lacks or when the
 * sprite failed. The PNG is drawn as served (it is not an SDF), so it is not tinted. The caller
 * revokes the URL when done.
 */
export async function loadMapIcon(api: ForesignalClient, name: string): Promise<string> {
  const blob = await unwrap(
    api.GET('/v1/map/icons/{name}.png', {
      params: { path: { name } },
      headers: { Accept: 'image/png' },
      parseAs: 'blob',
    }),
  );
  return URL.createObjectURL(blob as unknown as Blob);
}
