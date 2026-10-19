/** Formatting and scale helpers for the map HUD. Pure functions; no Cesium dependency. */

/** Formats a latitude in degrees with four decimals and a degree sign, e.g. `28.3921°`. */
export function formatDegrees(degrees: number): string {
  return `${degrees.toFixed(4)}°`;
}

/**
 * Formats a height in meters for the ELEV readout: meters below 10 km, whole kilometers above,
 * with thousands separators (`850 m`, `12,400 km`).
 */
export function formatHeight(meters: number): string {
  if (Math.abs(meters) < 10_000) return `${Math.round(meters).toLocaleString('en-US')} m`;
  return `${Math.round(meters / 1000).toLocaleString('en-US')} km`;
}

/** A scale bar: its length in pixels and the distance it stands for. */
export interface ScaleBar {
  /** Bar width in CSS pixels. */
  pixels: number;
  /** Distance the bar represents, in meters. */
  meters: number;
  /** Display label, e.g. `1,000 km` or `500 m`. */
  label: string;
}

/**
 * Picks a round scale-bar distance (1, 2 or 5 × 10ⁿ meters) that fits in `maxPixels`, given how
 * many meters `maxPixels` spans on the ground. Returns undefined for a non-positive span.
 */
export function niceScale(metersAcrossMax: number, maxPixels: number): ScaleBar | undefined {
  if (!(metersAcrossMax > 0) || !(maxPixels > 0)) return undefined;
  const magnitude = 10 ** Math.floor(Math.log10(metersAcrossMax));
  const step = [5, 2, 1].map((m) => m * magnitude).find((d) => d <= metersAcrossMax) ?? magnitude;
  const label =
    step >= 1000
      ? `${(step / 1000).toLocaleString('en-US')} km`
      : `${step.toLocaleString('en-US')} m`;
  return { pixels: Math.round((step / metersAcrossMax) * maxPixels), meters: step, label };
}

/** A view rectangle in degrees. */
export interface DegreeRectangle {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Places a view rectangle on an equirectangular inset of the given size. Returns one box, or two
 * when the rectangle crosses the antimeridian (east < west).
 */
export function insetBoxes(
  rect: DegreeRectangle,
  width: number,
  height: number,
): Array<{ left: number; top: number; width: number; height: number }> {
  const x = (lon: number) => ((lon + 180) / 360) * width;
  const y = (lat: number) => ((90 - lat) / 180) * height;
  const top = y(rect.north);
  const boxHeight = y(rect.south) - top;
  if (rect.east >= rect.west) {
    return [{ left: x(rect.west), top, width: x(rect.east) - x(rect.west), height: boxHeight }];
  }
  return [
    { left: x(rect.west), top, width: width - x(rect.west), height: boxHeight },
    { left: 0, top, width: x(rect.east), height: boxHeight },
  ];
}
