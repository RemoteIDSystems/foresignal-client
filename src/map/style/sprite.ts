import type { components } from '../../api/generated/schema';

/** A sprite index: icon name → its rectangle in the sheet (`getMapSprite` JSON). */
export type SpriteIndex = components['schemas']['MapSpriteIndex'];

/** Sprite file names the backend serves (`getMapSprite`'s `spriteFile` pattern). */
const SPRITE_FILE = /^foresignal-[0-9a-f]{8}(@2x)?\.(json|png)$/;

/**
 * The `getMapSprite` file name for a style's `sprite` URL (`…/v1/map/sprites/foresignal-{sha8}`),
 * at 1× or 2×. The name is requested through the API client, so it is sent to the client's own
 * backend URL with its credentials, whatever host the style's `publicBaseUrl` names. Returns
 * undefined when the URL does not end in a sprite name.
 */
export function spriteFileName(
  spriteUrl: string,
  ratio: 1 | 2,
  extension: 'json' | 'png',
): string | undefined {
  const base = (spriteUrl.split(/[?#]/)[0] ?? '').split('/').pop() ?? '';
  const name = `${base}${ratio === 2 ? '@2x' : ''}.${extension}`;
  return SPRITE_FILE.test(name) ? name : undefined;
}

/** Where MapLibre's SDF shader puts an icon's fill edge, as a fraction of the distance range. */
export const SDF_INNER_EDGE = 0.75;

/** How many times the sprite's median shape size an icon must exceed to be scaled down. */
export const OVERSIZED_FACTOR = 1.5;

/** A CSS hex color (`#rgb` or `#rrggbb`) as 0–255 channels; black for anything else. */
export function hexToRgb(color: string): [number, number, number] {
  const hex = color.trim().replace(/^#/, '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** How to draw an SDF icon: its fill color and an optional halo. */
export interface SdfPaint {
  color: string;
  haloColor?: string;
  /** Halo width in pixels at the icon's own size. */
  haloWidth?: number;
  /** The sprite's pixel ratio (2 for the `@2x` sheet). */
  pixelRatio?: number;
}

/**
 * Renders an SDF icon to straight RGBA pixels. The sprite stores a signed distance in each pixel's
 * alpha; this applies MapLibre's own symbol shader so the legend shows icons as the map draws them
 * (maplibre-gl 6.11.2 `src/shaders/glsl/symbol_sdf.fragment.glsl`, at icon size 1): the fill edge is
 * at 0.75, the halo edge at `(6 − haloWidth) / 8`, both smoothed by `0.105 / pixelRatio`, and the
 * fill is composited over the halo.
 *
 * @param distance The icon's alpha channel, one byte per pixel.
 */
export function renderSdf(
  distance: ArrayLike<number>,
  paint: SdfPaint,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(distance.length * 4);
  const fill = hexToRgb(paint.color);
  const halo = paint.haloColor ? hexToRgb(paint.haloColor) : undefined;
  const haloWidth = halo ? (paint.haloWidth ?? 0) : 0;
  const gamma = 0.105 / (paint.pixelRatio ?? 1);
  const innerEdge = SDF_INNER_EDGE;
  const haloEdge = (6 - haloWidth) / 8;
  for (let i = 0; i < distance.length; i++) {
    const d = (distance[i] ?? 0) / 255;
    const fillAlpha = smoothstep(innerEdge - gamma, innerEdge + gamma, d);
    let r = fill[0] * fillAlpha;
    let g = fill[1] * fillAlpha;
    let b = fill[2] * fillAlpha;
    let a = fillAlpha;
    if (halo && haloWidth > 0) {
      const insideHalo = smoothstep(innerEdge, innerEdge + 2 * gamma, d);
      const haloAlpha = Math.min(smoothstep(haloEdge - gamma, haloEdge + gamma, d), 1 - insideHalo);
      const under = 1 - fillAlpha;
      r += under * halo[0] * haloAlpha;
      g += under * halo[1] * haloAlpha;
      b += under * halo[2] * haloAlpha;
      a += under * haloAlpha;
    }
    // Premultiplied above; ImageData wants straight alpha.
    out[i * 4] = a > 0 ? r / a : 0;
    out[i * 4 + 1] = a > 0 ? g / a : 0;
    out[i * 4 + 2] = a > 0 ? b / a : 0;
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/** GLSL `smoothstep`. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** A loaded sprite: its index and the sheet's alpha channel, ready to render icons from. */
export class SpriteSheet {
  private readonly cache = new Map<string, string>();
  private readonly glyphSizes = new Map<string, number>();
  private reference: number | undefined;

  /**
   * @param index The sprite index.
   * @param alpha The sheet's alpha channel, row-major, `width` pixels wide.
   * @param width The sheet's width in pixels.
   * @param pixelRatio The sheet's pixel ratio (1, or 2 for `@2x`).
   */
  constructor(
    readonly index: SpriteIndex,
    private readonly alpha: Uint8Array,
    private readonly width: number,
    readonly pixelRatio: number,
  ) {}

  /** True when the sprite has this icon. */
  has(name: string): boolean {
    return name in this.index;
  }

  /** The icon's distance field, row-major, or undefined when the sprite lacks it. */
  distanceField(name: string): { data: Uint8Array; width: number; height: number } | undefined {
    const entry = this.index[name];
    if (!entry) return undefined;
    const data = new Uint8Array(entry.width * entry.height);
    for (let row = 0; row < entry.height; row++) {
      const start = (entry.y + row) * this.width + entry.x;
      data.set(this.alpha.subarray(start, start + entry.width), row * entry.width);
    }
    return { data, width: entry.width, height: entry.height };
  }

  /**
   * The size of an icon's drawn shape in CSS pixels: the larger side of the box around the pixels
   * inside the fill edge. This is what the eye compares, not the sprite cell, whose padding differs
   * between icons. Undefined when the sprite lacks the icon.
   */
  glyphSize(name: string): number | undefined {
    const cached = this.glyphSizes.get(name);
    if (cached !== undefined) return cached;
    const field = this.distanceField(name);
    if (!field) return undefined;
    const threshold = SDF_INNER_EDGE * 255;
    let minX = field.width;
    let minY = field.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < field.height; y++) {
      for (let x = 0; x < field.width; x++) {
        if ((field.data[y * field.width + x] ?? 0) < threshold) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    const size = maxX < 0 ? 0 : Math.max(maxX - minX + 1, maxY - minY + 1) / this.pixelRatio;
    this.glyphSizes.set(name, size);
    return size;
  }

  /** The median shape size across the sprite: the size icons are meant to share. */
  referenceGlyphSize(): number {
    if (this.reference === undefined) {
      const sizes = Object.keys(this.index)
        .map((name) => this.glyphSize(name) ?? 0)
        .filter((size) => size > 0)
        .sort((a, b) => a - b);
      this.reference = sizes[Math.floor(sizes.length / 2)] ?? 0;
    }
    return this.reference;
  }

  /**
   * The factor to draw an icon at so it matches the others: 1 for an icon of ordinary size, and
   * `reference / size` for one whose shape is more than {@link OVERSIZED_FACTOR} times the
   * sprite's median (the live sprite's fighter-jet, sailboat and snow are about 3.5 times). The map
   * multiplies the style's `icon-size` by it; the legend draws the cell at this scale.
   */
  displayScale(name: string): number {
    const size = this.glyphSize(name);
    const reference = this.referenceGlyphSize();
    if (!size || !reference || size <= reference * OVERSIZED_FACTOR) return 1;
    return reference / size;
  }

  /** The icon's cell in CSS pixels at its {@link displayScale}; undefined when it is missing. */
  displaySize(name: string): { width: number; height: number } | undefined {
    const entry = this.index[name];
    if (!entry) return undefined;
    const scale = this.displayScale(name) / entry.pixelRatio;
    return { width: entry.width * scale, height: entry.height * scale };
  }

  /**
   * The icon drawn in `paint` as a PNG data URL, cached per icon and paint; undefined when the
   * sprite lacks it or the browser has no 2D canvas.
   */
  iconUrl(name: string, paint: SdfPaint): string | undefined {
    const key = `${name}|${paint.color}|${paint.haloColor ?? ''}|${paint.haloWidth ?? 0}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const field = this.distanceField(name);
    if (!field) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = field.width;
    canvas.height = field.height;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const pixels = renderSdf(field.data, { ...paint, pixelRatio: this.pixelRatio });
    context.putImageData(new ImageData(pixels, field.width, field.height), 0, 0);
    const url = canvas.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }

  /** Decodes a sprite sheet PNG into a {@link SpriteSheet}, reading only its alpha channel. */
  static async decode(index: SpriteIndex, png: Blob, pixelRatio: number): Promise<SpriteSheet> {
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No 2D canvas to decode the sprite sheet.');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3] ?? 0;
    return new SpriteSheet(index, alpha, canvas.width, pixelRatio);
  }
}
