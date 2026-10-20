/** Web Mercator's y for a latitude in degrees (unitless, the equator at 0). */
export function mercatorY(latitude: number): number {
  const phi = (latitude * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + phi / 2));
}

/**
 * For row `row` of an image `height` rows tall that spans `south`..`north` linearly in latitude,
 * the row of a Web Mercator image of the same span that shows the same latitude (fractional).
 */
export function mercatorSourceRow(
  row: number,
  height: number,
  south: number,
  north: number,
): number {
  const latitude = north - ((row + 0.5) / height) * (north - south);
  const top = mercatorY(north);
  const bottom = mercatorY(south);
  return ((top - mercatorY(latitude)) / (top - bottom)) * height - 0.5;
}

/** A 2D canvas to draw into; `document.createElement('canvas')` in the browser. */
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

/** The browser's canvas. */
const browserCanvas: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/**
 * Re-projects a loop frame from Web Mercator (`getProductLoop` images are EPSG:3857) to latitude
 * and longitude, which is how Cesium drapes a single image over a rectangle: each output row is
 * the source row at its latitude. Without this, a loop over a tall box would sit north or south of
 * the tiles it replaces.
 */
export function reprojectToGeographic(
  image: CanvasImageSource & { width: number; height: number },
  bounds: readonly number[],
  createCanvas: CanvasFactory = browserCanvas,
): HTMLCanvasElement {
  const [, south, , north] = bounds as [number, number, number, number];
  const { width, height } = image;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  for (let row = 0; row < height; row++) {
    const source = Math.min(
      height - 1,
      Math.max(0, Math.round(mercatorSourceRow(row, height, south, north))),
    );
    context.drawImage(image, 0, source, width, 1, 0, row, width, 1);
  }
  return canvas;
}
