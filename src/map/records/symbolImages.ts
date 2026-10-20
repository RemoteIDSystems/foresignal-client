import { paintKey, type SpriteSheet } from '../style/sprite';
import type { PointSymbol } from './featureStyle';

/** A point symbol drawn as an image, and the size to show it at. */
export interface SymbolImage {
  /** Stable id: equal symbols share one image (and one texture in a billboard collection). */
  key: string;
  canvas: HTMLCanvasElement;
  /** Display size in CSS pixels. */
  width: number;
  height: number;
}

/** Radius of the circle drawn for an icon the sprite lacks, in CSS pixels. */
const MISSING_ICON_RADIUS = 5;

/**
 * Draws point symbols as images for the map's billboards, one image per distinct symbol: sprite
 * icons rendered from the SDF sheet in their style color and halo at their normalized display
 * size (006), and circles drawn on a canvas at the device pixel ratio. An icon the sprite lacks is
 * drawn as a circle in its color. Rotation is not baked in: the billboard rotates the image.
 */
export class SymbolImages {
  private readonly images = new Map<string, SymbolImage | null>();

  /**
   * @param sprite The overlay style's sprite, when it loaded.
   * @param pixelRatio The device pixel ratio circles are drawn at.
   */
  constructor(
    private readonly sprite: SpriteSheet | undefined,
    private readonly pixelRatio: number,
  ) {}

  /** The image for a point symbol; undefined only when the browser has no 2D canvas. */
  imageFor(symbol: PointSymbol): SymbolImage | undefined {
    if (symbol.type === 'icon') {
      const paint = {
        color: symbol.color,
        haloColor: symbol.haloColor,
        haloWidth: symbol.haloWidth,
      };
      const key = `icon:${paintKey(symbol.icon, paint)}`;
      const cached = this.images.get(key);
      if (cached !== undefined) return cached ?? undefined;
      const canvas = this.sprite?.iconCanvas(symbol.icon, paint);
      const size = this.sprite?.displaySize(symbol.icon);
      if (canvas && size) {
        const image = { key, canvas, width: size.width, height: size.height };
        this.images.set(key, image);
        return image;
      }
      return this.circle({
        type: 'circle',
        radius: MISSING_ICON_RADIUS,
        color: symbol.color,
        opacity: 1,
      });
    }
    return this.circle(symbol);
  }

  /** A filled circle with its optional stroke, drawn at the device pixel ratio. */
  private circle(symbol: Extract<PointSymbol, { type: 'circle' }>): SymbolImage | undefined {
    const stroke = symbol.strokeColor ? (symbol.strokeWidth ?? 0) : 0;
    const key = `circle:${symbol.radius}|${symbol.color}|${symbol.opacity}|${symbol.strokeColor ?? ''}|${stroke}`;
    const cached = this.images.get(key);
    if (cached !== undefined) return cached ?? undefined;
    const size = Math.ceil(2 * (symbol.radius + stroke)) + 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(size * this.pixelRatio);
    canvas.height = canvas.width;
    const context = canvas.getContext('2d');
    if (!context) {
      this.images.set(key, null);
      return undefined;
    }
    context.scale(this.pixelRatio, this.pixelRatio);
    context.beginPath();
    context.arc(size / 2, size / 2, symbol.radius, 0, Math.PI * 2);
    context.globalAlpha = symbol.opacity;
    context.fillStyle = symbol.color;
    context.fill();
    if (stroke > 0 && symbol.strokeColor) {
      context.globalAlpha = 1;
      context.lineWidth = stroke;
      context.strokeStyle = symbol.strokeColor;
      context.stroke();
    }
    const image = { key, canvas, width: size, height: size };
    this.images.set(key, image);
    return image;
  }
}
