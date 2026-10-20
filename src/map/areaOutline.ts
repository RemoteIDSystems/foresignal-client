import type { components } from '../api/generated/schema';

/** A GeoJSON geometry, as the backend gives it (`Geometry`). */
export type Geometry = components['schemas']['Geometry'];

/** A drawable piece of a geometry: a closed ring, an open line, or a point. */
export interface OutlinePart {
  type: 'ring' | 'line' | 'point';
  /** `[longitude, latitude]` pairs; one for a point. */
  coordinates: [number, number][];
}

const pair = (position: unknown): [number, number] | undefined => {
  if (!Array.isArray(position) || position.length < 2) return undefined;
  const [lon, lat] = position as unknown[];
  return typeof lon === 'number' && typeof lat === 'number' ? [lon, lat] : undefined;
};

const path = (positions: unknown): [number, number][] =>
  Array.isArray(positions)
    ? positions.map(pair).filter((p): p is [number, number] => p !== undefined)
    : [];

/**
 * A geometry's outline as rings (each polygon's outer and inner rings), lines and points, so a
 * situation's area can be drawn over the map without filling what lies under it. Malformed
 * positions are skipped.
 */
export function outlineParts(geometry: Geometry | null | undefined): OutlinePart[] {
  if (!geometry) return [];
  const coordinates = geometry.coordinates as unknown;
  switch (geometry.type) {
    case 'Point': {
      const point = pair(coordinates);
      return point ? [{ type: 'point', coordinates: [point] }] : [];
    }
    case 'MultiPoint':
      return path(coordinates).map((point) => ({ type: 'point', coordinates: [point] }));
    case 'LineString':
      return [{ type: 'line', coordinates: path(coordinates) }];
    case 'MultiLineString':
      return (coordinates as unknown[]).map((line) => ({ type: 'line', coordinates: path(line) }));
    case 'Polygon':
      return (coordinates as unknown[]).map((ring) => ({ type: 'ring', coordinates: path(ring) }));
    case 'MultiPolygon':
      return (coordinates as unknown[]).flatMap((polygon) =>
        (Array.isArray(polygon) ? polygon : []).map((ring): OutlinePart => ({
          type: 'ring',
          coordinates: path(ring),
        })),
      );
    case 'GeometryCollection': {
      const members = (geometry as { geometries?: Geometry[] }).geometries ?? [];
      return members.flatMap(outlineParts);
    }
    default:
      return [];
  }
}
