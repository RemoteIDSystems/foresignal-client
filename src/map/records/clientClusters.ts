import type { AggregationStyle, StyleModel } from '../style/model';
import { DEFAULT_AGGREGATION, type HexCell } from './hexCells';

/**
 * Below this map zoom, point layers the backend does not aggregate are drawn as client cells
 * while the map holds more points than {@link CLUSTER_POINT_BUDGET}: the zoom the backend's own
 * aggregated layers (aircraft) declare as their `aggBelowZoom`.
 */
export const CLIENT_CLUSTER_BELOW_ZOOM = 7;

/**
 * Points in view, across the layers, past which the layers cluster below
 * {@link CLIENT_CLUSTER_BELOW_ZOOM}. Fewer are drawn as records, as before (the live earthquakes,
 * some 900, stay points). The 035 GPU run drew 1,292 points at 60 fps and 37,500 at 32 fps.
 */
export const CLUSTER_POINT_BUDGET = 5_000;

/**
 * Points in view below which clustering, once on, turns off again: lower than the budget, so a
 * view near it does not switch back and forth as tiles arrive.
 */
export const CLUSTER_RELEASE_POINTS = 4_000;

/**
 * Hexagons across one tile, as the backend builds its `agg=hex` cells (the OpenAPI's
 * `foresignal.tiles.cellsPerTile`, default 32), so client cells are the backend's in size and
 * place.
 */
export const CELLS_PER_TILE = 32;

/** The WGS 84 semi-major axis, the radius EPSG:3857 projects onto, in meters. */
const EARTH_RADIUS_M = 6_378_137;

/** EPSG:3857's width of the world, in meters. */
const WORLD_M = 2 * Math.PI * EARTH_RADIUS_M;

/**
 * Whether the layers should cluster now, given the points in view and whether they cluster
 * already: on past {@link CLUSTER_POINT_BUDGET}, off again only under
 * {@link CLUSTER_RELEASE_POINTS}.
 */
export function shouldCluster(points: number, clustering: boolean): boolean {
  return clustering ? points >= CLUSTER_RELEASE_POINTS : points > CLUSTER_POINT_BUDGET;
}

/**
 * The look of client cells: the overlay style's aggregation (the count ramp, opacity and outline
 * the backend's `--agg` layers are drawn with), so cells look the same whichever side counted
 * them; the default ramp when the style has none.
 */
export function clusterStyle(
  model: StyleModel,
): Pick<AggregationStyle, 'ramp' | 'opacity' | 'outlineColor'> {
  return model.layers.find((layer) => layer.aggregation)?.aggregation ?? DEFAULT_AGGREGATION;
}

/**
 * Counts points (longitude, latitude) into the backend's hexagon grid for tile zoom `z`: flat-top
 * hexagons in EPSG:3857 with {@link CELLS_PER_TILE} circumradii across a tile, centered on a
 * lattice whose origin is the projection's (0, 0), as the backend's `agg=hex` tiles carry them.
 * Each cell's ring is closed and starts at its west vertex, going clockwise, as the backend's do.
 * Points the projection cannot place (at a pole) are left out.
 */
export function pointCells(points: Iterable<readonly [number, number]>, z: number): HexCell[] {
  const radius = WORLD_M / 2 ** z / CELLS_PER_TILE;
  const cells = new Map<string, { q: number; r: number; count: number }>();
  for (const [longitude, latitude] of points) {
    const x = (longitude * Math.PI * EARTH_RADIUS_M) / 180;
    const y = EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const [q, r] = hexAt(x / radius, y / radius);
    const key = `${q},${r}`;
    const cell = cells.get(key);
    if (cell) cell.count++;
    else cells.set(key, { q, r, count: 1 });
  }
  return [...cells.values()].map(({ q, r, count }) => {
    const ring = hexRing(q, r, radius);
    return { key: `${z}:${q},${r}`, ring, count };
  });
}

/** The axial coordinates of the flat-top hexagon (unit circumradius) holding a point. */
function hexAt(x: number, y: number): [number, number] {
  const q = (2 / 3) * x;
  const r = -x / 3 + (Math.sqrt(3) / 3) * y;
  // Rounds the cube coordinates (q, r, -q - r) to the nearest hexagon.
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

/** Angles of a flat-top hexagon's vertices, west first and clockwise (in degrees, y north). */
const VERTEX_ANGLES = [180, 120, 60, 0, 300, 240, 180].map((degrees) => (degrees * Math.PI) / 180);

/** A hexagon's closed ring in degrees, from its axial coordinates and circumradius in meters. */
function hexRing(q: number, r: number, radius: number): [number, number][] {
  const cx = radius * 1.5 * q;
  const cy = radius * Math.sqrt(3) * (r + q / 2);
  return VERTEX_ANGLES.map((angle) => {
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    return [
      (x / EARTH_RADIUS_M) * (180 / Math.PI),
      (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * (180 / Math.PI),
    ];
  });
}
