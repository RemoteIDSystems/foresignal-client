/**
 * Web Mercator tile math for the backend's XYZ record tiles (`getTile`). Zoom here is MapLibre's
 * map zoom, at which one tile covers 512 CSS pixels: the zoom the overlay style's `minzoom` and the
 * backend's `aggBelowZoom` are written in, so a tile requested at `z` is drawn at map zoom `z`.
 */

/** One XYZ tile. */
export interface TileId {
  z: number;
  x: number;
  y: number;
}

/** A geographic rectangle in degrees; `west > east` when it crosses the antimeridian. */
export interface GeoRect {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** The WGS84 semi-major axis, which Web Mercator uses as its sphere radius. */
const EARTH_RADIUS = 6_378_137;

/** Pixels across one tile at its own zoom (MapLibre's vector tile size). */
export const TILE_PIXELS = 512;

/** The latitude where Web Mercator stops: the square world's edge. */
export const MAX_MERCATOR_LATITUDE = 85.0511287798066;

/** How far inside an exclusive edge a coordinate is read, in degrees. */
const EDGE_EPSILON = 1e-9;

/** The tile key used in caches and maps: `z/x/y`. */
export function tileKey(tile: TileId): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

/**
 * The map zoom for a ground resolution: the zoom at which Web Mercator draws `metersPerPixel`
 * meters of ground per CSS pixel at `latitude`. Fractional; clamped to zero below.
 */
export function zoomForResolution(metersPerPixel: number, latitude: number): number {
  const latitudeRadians = (Math.max(-89, Math.min(89, latitude)) * Math.PI) / 180;
  const circumference = 2 * Math.PI * EARTH_RADIUS * Math.cos(latitudeRadians);
  return Math.max(0, Math.log2(circumference / (TILE_PIXELS * metersPerPixel)));
}

/** The tile column holding a longitude at zoom `z`. */
export function tileX(longitude: number, z: number): number {
  const n = 2 ** z;
  const x = Math.floor(((longitude + 180) / 360) * n);
  return Math.min(n - 1, Math.max(0, x));
}

/** The tile row holding a latitude at zoom `z` (row 0 at the north edge). */
export function tileY(latitude: number, z: number): number {
  const n = 2 ** z;
  const clamped = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  const radians = (clamped * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * n);
  return Math.min(n - 1, Math.max(0, y));
}

/**
 * The longitude and latitude, in degrees, of a point given in a tile's own coordinates (0 at the
 * tile's west and north edges, `extent` at its east and south edges).
 */
export function tilePointToLonLat(
  tile: TileId,
  extent: number,
  px: number,
  py: number,
): [number, number] {
  const n = 2 ** tile.z;
  const longitude = ((tile.x + px / extent) / n) * 360 - 180;
  const mercatorY = Math.PI * (1 - (2 * (tile.y + py / extent)) / n);
  const latitude = (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;
  return [longitude, latitude];
}

/** The tile's own bounds in degrees. */
export function tileBounds(tile: TileId): GeoRect {
  const [west, north] = tilePointToLonLat(tile, 1, 0, 0);
  const [east, south] = tilePointToLonLat(tile, 1, 1, 1);
  return { west, south, east, north };
}

/**
 * The tiles at zoom `z` that cover a rectangle, west to east and north to south; its east and
 * south edges are exclusive. A rectangle that crosses the antimeridian (`west > east`) is covered on both sides. Latitudes beyond Web
 * Mercator's edge are clamped to it.
 */
export function tilesInRect(rect: GeoRect, z: number): TileId[] {
  // East and south edges are exclusive: a rectangle ending on a tile edge does not take the next.
  const east = rect.east - EDGE_EPSILON;
  const south = Math.min(rect.north, rect.south + EDGE_EPSILON);
  const rows = { from: tileY(rect.north, z), to: tileY(south, z) };
  const columns: [number, number][] =
    rect.west <= rect.east
      ? [[tileX(rect.west, z), tileX(Math.max(rect.west, east), z)]]
      : [
          [tileX(rect.west, z), 2 ** z - 1],
          [0, tileX(east, z)],
        ];
  const tiles: TileId[] = [];
  for (const [from, to] of columns) {
    for (let x = from; x <= to; x++) {
      for (let y = rows.from; y <= rows.to; y++) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/**
 * The rectangle around points seen on a flat (2D) map, in degrees, given the longitude at the
 * view's center. Longitudes are read relative to the center, so a view that scrolls across the
 * antimeridian gives `west > east`. Each point is read within 180 degrees of the center, so the
 * rectangle is under 360 degrees wide; a view wider than the world shows the map's edge, where a
 * caller's corner picks fail. Undefined for no points.
 */
export function boundsAround(
  centerLongitude: number,
  points: [number, number][],
): GeoRect | undefined {
  if (points.length === 0) return undefined;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of points) {
    const offset = ((((longitude - centerLongitude + 180) % 360) + 360) % 360) - 180;
    west = Math.min(west, centerLongitude + offset);
    east = Math.max(east, centerLongitude + offset);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  return { west: normalizeLongitude(west), south, east: normalizeLongitude(east), north };
}

/** A longitude brought into [-180, 180]. */
function normalizeLongitude(longitude: number): number {
  if (longitude >= -180 && longitude <= 180) return longitude;
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/** The parts of the view a layer may request tiles for. */
export interface TilePlanOptions {
  /** The view's rectangle; undefined when the view shows the whole globe. */
  rect: GeoRect | undefined;
  /** The map zoom at the view center (fractional). */
  zoom: number;
  /** The layer's zoom range, from its TileJSON. */
  minzoom: number;
  maxzoom: number;
  /** The layer's TileJSON bounds, when it limits them. */
  bounds?: GeoRect;
  /** The most tiles one view may request; the zoom steps down until the view fits. */
  maxTiles: number;
}

/**
 * The tiles a layer needs for a view: at the view's whole zoom clamped to the layer's range, over
 * the view rectangle intersected with the layer's bounds, stepping the zoom down while more than
 * `maxTiles` would be needed. Returns an empty list when the view and the bounds do not meet.
 */
export function planTiles(options: TilePlanOptions): TileId[] {
  const { minzoom, maxzoom, maxTiles } = options;
  const world: GeoRect = { west: -180, south: -90, east: 180, north: 90 };
  const view = options.rect ?? world;
  const rects = intersect(view, options.bounds ?? world);
  if (rects.length === 0) return [];
  let z = Math.min(maxzoom, Math.max(minzoom, Math.floor(options.zoom)));
  for (;;) {
    const tiles = dedupe(rects.flatMap((rect) => tilesInRect(rect, z)));
    if (tiles.length <= maxTiles || z <= minzoom || z === 0) return tiles;
    z -= 1;
  }
}

/** Intersects a view rectangle (which may cross the antimeridian) with plain bounds. */
function intersect(view: GeoRect, bounds: GeoRect): GeoRect[] {
  const spans: [number, number][] =
    view.west <= view.east
      ? [[view.west, view.east]]
      : [
          [view.west, 180],
          [-180, view.east],
        ];
  const south = Math.max(view.south, bounds.south);
  const north = Math.min(view.north, bounds.north);
  if (south > north) return [];
  const out: GeoRect[] = [];
  for (const [west, east] of spans) {
    const w = Math.max(west, bounds.west);
    const e = Math.min(east, bounds.east);
    if (w <= e) out.push({ west: w, south, east: e, north });
  }
  return out;
}

/** Removes repeated tiles, keeping the first. */
function dedupe(tiles: TileId[]): TileId[] {
  const seen = new Set<string>();
  return tiles.filter((tile) => {
    const key = tileKey(tile);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
