import type { FieldManifest } from './productApi';

/** The png-uv encoding a field manifest lists. */
export type PngUvEncoding = NonNullable<NonNullable<FieldManifest['encodings']>['pngUv']>;

/**
 * A decoded wind field: u and v (m/s, east and north) on a regular latitude/longitude grid, rows
 * north to south, read from the png-uv encoding (`getProductFieldPngUv`), where red is u and green
 * is v, each scaled linearly over the manifest's `[uMin, uMax]` and `[vMin, vMax]`.
 */
export class WindField {
  readonly width: number;
  readonly height: number;
  private readonly west: number;
  private readonly south: number;
  private readonly east: number;
  private readonly north: number;
  private readonly pixels: Uint8ClampedArray;
  private readonly encoding: PngUvEncoding;

  /**
   * @param pixels The png's RGBA pixels, `width × height × 4`.
   * @param encoding The manifest's `encodings.pngUv`: value ranges and `bounds` (`[w, s, e, n]`,
   *   longitudes possibly 0..360).
   */
  constructor(pixels: Uint8ClampedArray, width: number, height: number, encoding: PngUvEncoding) {
    this.pixels = pixels;
    this.width = width;
    this.height = height;
    this.encoding = encoding;
    const [west, south, east, north] = (encoding.bounds ?? [-180, -90, 180, 90]) as [
      number,
      number,
      number,
      number,
    ];
    this.west = west;
    this.south = south;
    this.east = east;
    this.north = north;
  }

  /**
   * The wind at a point, bilinearly interpolated, as `[u, v]` in m/s; undefined outside the field.
   * A longitude is wrapped to the field's span, so a 0..360 field answers −75° as 285°.
   */
  sample(longitude: number, latitude: number): [number, number] | undefined {
    const span = this.east - this.west;
    // A field that goes all the way round wraps: its last column's neighbor is its first.
    const wraps = span >= 359;
    let lon = longitude;
    if (wraps) {
      lon = this.west + ((((longitude - this.west) % 360) + 360) % 360);
    } else if (lon < this.west) {
      lon += 360;
    }
    if (latitude < this.south || latitude > this.north) return undefined;
    if (!wraps && (lon < this.west || lon > this.east)) return undefined;
    // Pixel centers sit on the grid's longitudes, `span / (width - 1)` apart.
    const x = ((lon - this.west) / span) * (this.width - 1);
    const y = ((this.north - latitude) / (this.north - this.south)) * (this.height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.min(this.height - 2, Math.max(0, Math.floor(y)));
    const fx = x - x0;
    const fy = Math.min(1, Math.max(0, y - y0));
    const column = (c: number) => (wraps ? c % this.width : Math.min(this.width - 1, c));
    const a = this.raw(column(x0), y0);
    const b = this.raw(column(x0 + 1), y0);
    const c = this.raw(column(x0), y0 + 1);
    const d = this.raw(column(x0 + 1), y0 + 1);
    const mix = (i: 0 | 1) =>
      (a[i] * (1 - fx) + b[i] * fx) * (1 - fy) + (c[i] * (1 - fx) + d[i] * fx) * fy;
    return [mix(0), mix(1)];
  }

  /** The decoded u and v of one pixel. */
  private raw(x: number, y: number): [number, number] {
    const i = (y * this.width + x) * 4;
    const { uMin = 0, uMax = 0, vMin = 0, vMax = 0 } = this.encoding;
    return [
      uMin + (this.pixels[i]! / 255) * (uMax - uMin),
      vMin + (this.pixels[i + 1]! / 255) * (vMax - vMin),
    ];
  }
}
