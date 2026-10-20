import { prettifyId } from '../../lib/labels';
import { tileBounds } from './tileMath';

/** Meters per degree of latitude (and of longitude at the equator), on the WGS 84 sphere. */
const METERS_PER_DEGREE = 111_319.49;

/** Pixels around a shape that still count as on it, so small symbols and thin lines are easy to hit. */
export const PICK_TOLERANCE_PX = 4;

/**
 * Pixels around a tile within which a symbol of a record inside it can reach: half the largest
 * symbol, plus the tolerance. A point near a tile's edge is found from the tile next door.
 */
export const TILE_PICK_MARGIN_PX = 40;

/** The identity each drawn record (or aggregate cell) carries, for hover and selection (014). */
export interface RecordPickId {
  layer: string;
  source?: string;
  externalId?: string;
  kind?: string;
  /** For a hexagon cell: the records it counts. */
  count?: number;
}

/** Where the pointer is on the map, and the map's scale there. */
export interface PickQuery {
  longitude: number;
  latitude: number;
  /** Ground meters one screen pixel spans at the pointer. */
  metersPerPixel: number;
}

/** The shape a record is drawn as, in degrees and (for symbols) screen pixels. */
export type PickShape =
  | { type: 'point'; at: [number, number]; width: number; height: number }
  | { type: 'line'; lines: [number, number][][]; width: number }
  | { type: 'polygon'; polygons: [number, number][][][] }
  | { type: 'cell'; ring: [number, number][] };

/** One drawn record (or cell) as picking sees it. */
export interface Pickable {
  id: RecordPickId;
  /** The record's title, when its tile carries one. */
  title?: string;
  shape: PickShape;
}

/** A record under the pointer. */
export interface RecordHit {
  id: RecordPickId;
  title?: string;
  /** What was hit: a point symbol, a line, a polygon, or an aggregate cell. */
  type: PickShape['type'];
  /** Where to mark it: a point's own position, else the pointer's. */
  longitude: number;
  latitude: number;
  /** A point symbol's size in pixels, for the selection box. */
  width?: number;
  height?: number;
  /** Screen pixels from the pointer to the shape (0 inside a polygon or cell). */
  distance: number;
}

/** Points draw over lines, and lines over areas, so the topmost wins. */
const RANK: Record<PickShape['type'], number> = { point: 0, line: 1, polygon: 2, cell: 3 };

/**
 * Tests one drawn record against the pointer: a point symbol is hit inside its box (plus
 * {@link PICK_TOLERANCE_PX}), a line within half its width plus the tolerance, a polygon or cell
 * inside it. Distances are measured on a plane tangent at the pointer, which at a pick's few pixels
 * is exact enough everywhere but the poles. Returns the hit, or undefined.
 */
export function hitTest(pickable: Pickable, query: PickQuery): RecordHit | undefined {
  const { shape } = pickable;
  const toPixels = pixelPlane(query);
  const hit = (distance: number, at?: [number, number]): RecordHit => ({
    id: pickable.id,
    ...(pickable.title !== undefined && { title: pickable.title }),
    type: shape.type,
    longitude: at?.[0] ?? query.longitude,
    latitude: at?.[1] ?? query.latitude,
    distance,
  });
  switch (shape.type) {
    case 'point': {
      const [x, y] = toPixels(shape.at);
      if (
        Math.abs(x) > shape.width / 2 + PICK_TOLERANCE_PX ||
        Math.abs(y) > shape.height / 2 + PICK_TOLERANCE_PX
      )
        return undefined;
      return { ...hit(Math.hypot(x, y), shape.at), width: shape.width, height: shape.height };
    }
    case 'line': {
      const reach = shape.width / 2 + PICK_TOLERANCE_PX;
      let best = Infinity;
      for (const line of shape.lines) {
        let previous = toPixels(line[0]!);
        for (let i = 1; i < line.length; i++) {
          const next = toPixels(line[i]!);
          best = Math.min(best, segmentDistance(previous, next));
          previous = next;
        }
      }
      return best <= reach ? hit(best) : undefined;
    }
    case 'polygon':
      return shape.polygons.some((rings) => insideRings(rings, toPixels)) ? hit(0) : undefined;
    case 'cell':
      return insideRings([shape.ring], toPixels) ? hit(0) : undefined;
  }
}

/** Orders hits topmost first: points, then lines, then areas; nearer first within each. */
export function compareHits(a: RecordHit, b: RecordHit): number {
  return RANK[a.type] - RANK[b.type] || a.distance - b.distance;
}

/**
 * True when a tile (`z/x/y`) may hold a record whose symbol reaches the pointer: the pointer is
 * inside the tile, widened by {@link TILE_PICK_MARGIN_PX}. Picking tests only the records of these
 * tiles, so its cost follows the records near the pointer, not every record drawn.
 */
export function tileMayHold(key: string, query: PickQuery): boolean {
  const [z, x, y] = key.split('/').map(Number);
  if (z === undefined || x === undefined || y === undefined) return false;
  const bounds = tileBounds({ z, x, y });
  const marginMeters = TILE_PICK_MARGIN_PX * query.metersPerPixel;
  const dLat = marginMeters / METERS_PER_DEGREE;
  const dLon = dLat / Math.max(0.01, Math.cos((query.latitude * Math.PI) / 180));
  const { longitude, latitude } = query;
  if (latitude < bounds.south - dLat || latitude > bounds.north + dLat) return false;
  if (dLon >= 180) return true;
  const west = bounds.west - dLon;
  const east = bounds.east + dLon;
  // A widened tile at the antimeridian reaches across it.
  return [longitude, longitude - 360, longitude + 360].some((lon) => lon >= west && lon <= east);
}

/** Bounding box of a ring, for a quick test before the exact one. */
export function ringBox(ring: readonly [number, number][]): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of ring) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
}

/**
 * Projects degrees to screen pixels from the pointer, east and north positive, on the plane tangent
 * at the pointer; longitudes are taken the short way round.
 */
function pixelPlane(query: PickQuery): (at: readonly [number, number]) => [number, number] {
  const cos = Math.cos((query.latitude * Math.PI) / 180);
  const scale = METERS_PER_DEGREE / query.metersPerPixel;
  return ([lon, lat]) => {
    let dLon = lon - query.longitude;
    dLon -= 360 * Math.round(dLon / 360);
    return [dLon * cos * scale, (lat - query.latitude) * scale];
  };
}

/** Distance from the origin (the pointer) to a segment. */
function segmentDistance(a: [number, number], b: [number, number]): number {
  const [ax, ay] = a;
  const dx = b[0] - ax;
  const dy = b[1] - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** True when the origin is inside a polygon's rings (even-odd, so holes count as outside). */
function insideRings(
  rings: readonly [number, number][][],
  toPixels: (at: readonly [number, number]) => [number, number],
): boolean {
  let inside = false;
  for (const ring of rings) {
    const points = ring.map(toPixels);
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]!;
      const [xj, yj] = points[j]!;
      if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** A hit's callout lines: its title, and what it is. */
export function describeHit(hit: RecordHit): { title: string; detail: string } {
  const kind = prettifyId(hit.id.kind ?? hit.id.layer);
  if (hit.type === 'cell') {
    const count = hit.id.count ?? 0;
    return {
      title: `${count.toLocaleString('en-US')} ${count === 1 ? 'record' : 'records'}`,
      detail: `${kind} · aggregated`,
    };
  }
  return {
    title: hit.title ?? hit.id.externalId ?? kind,
    detail: hit.id.source ? `${kind} · ${hit.id.source}` : kind,
  };
}
