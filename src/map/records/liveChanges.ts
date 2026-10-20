import { RASTER_FRAME_KIND, type Change, type LiveEvent } from '../../api/stream/ChangeStream';
import type { GeoRect, TileId } from './tileMath';
import { tileBounds } from './tileMath';

/** `[west, south, east, north]` in degrees. */
export type Box = readonly [number, number, number, number];

/**
 * Where a record changed on the map: its kind and source (a record layer is drawn per kind), and
 * the boxes it occupies now and occupied before, so the tiles that drew it there are loaded again
 * and the record appears, moves or disappears.
 */
export interface ChangedArea {
  kind: string;
  source: string;
  boxes: Box[];
}

/** The area a `change` event or `listChanges` item touches; none for raster frames (not records). */
export function changedArea(change: Change): ChangedArea | undefined {
  if (change.kind === RASTER_FRAME_KIND) return undefined;
  const boxes: Box[] = [change.bbox, change.prevPersistedBbox, change.prevLiveBbox].filter(isBox);
  if (boxes.length === 0) {
    const point = pointOf(change.geometry);
    if (point) boxes.push([point[0], point[1], point[0], point[1]]);
  }
  return boxes.length > 0 ? { kind: change.kind, source: change.source, boxes } : undefined;
}

/** The area a `live` position update touches: where it is now and where it was. */
export function liveArea(event: LiveEvent): ChangedArea | undefined {
  const boxes: Box[] = [event.bbox, event.prevBbox].filter(isBox);
  if (boxes.length === 0) {
    const point = pointOf(event.geometry);
    if (point) boxes.push([point[0], point[1], point[0], point[1]]);
  }
  return boxes.length > 0 ? { kind: event.kind, source: event.sourceId, boxes } : undefined;
}

/**
 * Whether a tile drew, or may have drawn, something in a box. Vector tiles carry a buffer of
 * features from just over their edges, so the tile is widened by {@link TILE_BUFFER} of its size.
 * A box with `west > east` crosses the antimeridian and is tested in two parts.
 */
export function tileTouches(tile: TileId, box: Box): boolean {
  const bounds = tileBounds(tile);
  const margin = (bounds.east - bounds.west) * TILE_BUFFER;
  const [west, south, east, north] = box;
  if (south > bounds.north + margin || north < bounds.south - margin) return false;
  const spans: [number, number][] =
    west <= east
      ? [[west, east]]
      : [
          [west, 180],
          [-180, east],
        ];
  return spans.some(([from, to]) => overlaps(bounds, margin, from, to));
}

/** A tile's buffer as a share of its width: 1/32 (the backend's tiles use less). */
const TILE_BUFFER = 1 / 32;

function overlaps(bounds: GeoRect, margin: number, west: number, east: number): boolean {
  return west <= bounds.east + margin && east >= bounds.west - margin;
}

function isBox(value: number[] | null | undefined): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite);
}

/** A point geometry's position. */
function pointOf(geometry: Change['geometry'] | undefined): [number, number] | undefined {
  if (!geometry || geometry.type !== 'Point') return undefined;
  const [longitude, latitude] = (geometry.coordinates ?? []) as number[];
  return longitude !== undefined && latitude !== undefined ? [longitude, latitude] : undefined;
}

/** `z/x/y` back into a tile. */
export function parseTileKey(key: string): TileId {
  const [z, x, y] = key.split('/').map(Number);
  return { z: z!, x: x!, y: y! };
}
