/**
 * Builds quantized-mesh terrain tiles from an elevation grid, in Cesium's geographic tiling scheme
 * (level 0 is two 180° tiles; TMS rows, row 0 at the south).
 *
 * Each tile samples a 65 × 65 grid from the elevation model, simplifies it with Martini (a
 * right-triangulated irregular network) to the level's error budget, and computes its header with
 * Cesium's own math, so the bounding sphere and horizon point agree with what Cesium computes.
 */
import Martini from '@mapbox/martini';
import { BoundingSphere, Cartesian3, Ellipsoid, EllipsoidalOccluder } from 'cesium';
import { QUANTIZED_MAX, reorderForHighWaterMark } from './quantized-mesh.mjs';

/** Samples per tile edge (Martini needs 2^n + 1; Cesium's own heightmap tiles are 65 wide). */
export const GRID = 65;

const martini = new Martini(GRID);
const ellipsoid = Ellipsoid.WGS84;
const occluder = new EllipsoidalOccluder(ellipsoid);

/** Tile bounds in degrees. `y` counts from the south (TMS). */
export function tileRectangle(level, x, y) {
  const size = 180 / 2 ** level;
  return {
    west: -180 + x * size,
    south: -90 + y * size,
    east: -180 + (x + 1) * size,
    north: -90 + (y + 1) * size,
  };
}

/** Number of tile columns and rows at a level. */
export function tileCounts(level) {
  return { columns: 2 ** (level + 1), rows: 2 ** level };
}

/**
 * An elevation grid covering the world: `width` × `height` cells, row 0 at the north, cell centers
 * at `-180 + (i + 0.5) × cell` and `90 - (j + 0.5) × cell` degrees.
 */
export class ElevationGrid {
  /** Wraps a row-major Float32Array of meters. */
  constructor(width, height, data) {
    if (data.length !== width * height) throw new Error('Grid size does not match its data.');
    this.width = width;
    this.height = height;
    this.data = data;
    this.cell = 360 / width;
  }

  /** Height at a longitude and latitude, bilinear; longitude wraps, latitude clamps at the poles. */
  sample(lon, lat) {
    const fx = (lon + 180) / this.cell - 0.5;
    const fy = (90 - lat) / this.cell - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.max(0, Math.min(this.height - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(this.height - 1, y0 + 1));
    const tx = fx - x0;
    const ty = Math.max(0, Math.min(1, fy - Math.floor(fy)));
    const wrap = (x) => ((x % this.width) + this.width) % this.width;
    const at = (x, y) => this.data[y * this.width + wrap(x)];
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y1) * (1 - tx) + at(x0 + 1, y1) * tx;
    return top * (1 - ty) + bottom * ty;
  }

  /** A grid half the size in each direction, each cell the mean of four. */
  halve() {
    const width = this.width >> 1;
    const height = this.height >> 1;
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = 2 * y * this.width + 2 * x;
        out[y * width + x] =
          (this.data[i] +
            this.data[i + 1] +
            this.data[i + this.width] +
            this.data[i + this.width + 1]) /
          4;
      }
    }
    return new ElevationGrid(width, height, out);
  }
}

/**
 * Builds the averaging pyramid of a grid, finest first, down to `minWidth` cells across. Sampling a
 * tile from the level whose cells match its spacing avoids aliasing on coarse tiles.
 */
export function pyramid(grid, minWidth = 256) {
  const levels = [grid];
  while (levels.at(-1).width / 2 >= minWidth && levels.at(-1).width % 2 === 0) {
    levels.push(levels.at(-1).halve());
  }
  return levels;
}

/** The coarsest pyramid level whose cells are no larger than `spacing` degrees. */
export function gridForSpacing(levels, spacing) {
  let chosen = levels[0];
  for (const level of levels) if (level.cell <= spacing) chosen = level;
  return chosen;
}

/**
 * Cesium's maximum geometric error for a terrain level, in meters: the level-0 estimate for
 * 65-sample tiles with two root tiles (`TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap`),
 * halved per level.
 */
export function levelGeometricError(level) {
  return (ellipsoid.maximumRadius * 2 * Math.PI * 0.25) / (GRID * 2) / 2 ** level;
}

/**
 * Builds one tile's mesh, ready for `encodeTile`.
 *
 * @param {ElevationGrid[]} levels The elevation pyramid.
 * @param {number} level Terrain level.
 * @param {number} x Tile column.
 * @param {number} y Tile row from the south.
 * @param {number} maxError Martini's error budget, meters.
 */
export function buildTile(levels, level, x, y, maxError) {
  const rect = tileRectangle(level, x, y);
  const spacing = (rect.east - rect.west) / (GRID - 1);
  const grid = gridForSpacing(levels, spacing);
  const lonAt = (col) => rect.west + col * spacing;
  const latAt = (row) => rect.north - row * spacing;

  const terrain = new Float32Array(GRID * GRID);
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++)
      terrain[row * GRID + col] = grid.sample(lonAt(col), latAt(row));
  }
  const mesh = martini.createTile(curvedTerrain(terrain, rect, lonAt, latAt)).getMesh(maxError);
  const count = mesh.vertices.length / 2;

  // Counter-clockwise in (east, north): Martini's rows run north to south, so check each triangle.
  const triangles = Uint32Array.from(mesh.triangles);
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const ax = mesh.vertices[2 * a],
      ay = -mesh.vertices[2 * a + 1];
    const bx = mesh.vertices[2 * b],
      by = -mesh.vertices[2 * b + 1];
    const cx = mesh.vertices[2 * c],
      cy = -mesh.vertices[2 * c + 1];
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) {
      triangles[t + 1] = c;
      triangles[t + 2] = b;
    }
  }
  const order = reorderForHighWaterMark(count, triangles);

  const heights = new Float64Array(count);
  const positions = [];
  let minimumHeight = Infinity;
  let maximumHeight = -Infinity;
  for (let i = 0; i < count; i++) {
    const old = order.newToOld[i];
    const col = mesh.vertices[2 * old];
    const row = mesh.vertices[2 * old + 1];
    const h = terrain[row * GRID + col];
    heights[i] = h;
    minimumHeight = Math.min(minimumHeight, h);
    maximumHeight = Math.max(maximumHeight, h);
    positions.push(Cartesian3.fromDegrees(lonAt(col), latAt(row), h, ellipsoid));
  }
  const range = maximumHeight - minimumHeight;

  const u = new Uint16Array(count);
  const v = new Uint16Array(count);
  const height = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    const old = order.newToOld[i];
    const col = mesh.vertices[2 * old];
    const row = mesh.vertices[2 * old + 1];
    u[i] = Math.round((col / (GRID - 1)) * QUANTIZED_MAX);
    v[i] = Math.round(((GRID - 1 - row) / (GRID - 1)) * QUANTIZED_MAX);
    height[i] = range > 0 ? Math.round(((heights[i] - minimumHeight) / range) * QUANTIZED_MAX) : 0;
  }

  const sphere = BoundingSphere.fromPoints(positions);
  const horizon =
    occluder.computeHorizonCullingPointPossiblyUnderEllipsoid(
      sphere.center,
      positions,
      minimumHeight,
    ) ?? farHorizonPoint(rect);

  return {
    center: [sphere.center.x, sphere.center.y, sphere.center.z],
    minimumHeight,
    maximumHeight,
    boundingSphere: [sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius],
    horizonOcclusionPoint: [horizon.x, horizon.y, horizon.z],
    u,
    v,
    height,
    triangles: order.triangles,
  };
}

/**
 * The samples as heights above the tile's tangent plane, `(R + h) · cos δ` with δ the angle from the
 * tile's center, for simplification only. Martini measures error vertically on a flat grid; on raw
 * heights a flat ocean tile would collapse to two triangles and the globe would look faceted. Above
 * the tangent plane, the Earth's curvature counts as error, so big tiles keep enough triangles to
 * stay round.
 */
function curvedTerrain(terrain, rect, lonAt, latAt) {
  const center = Cartesian3.fromDegrees(
    (rect.west + rect.east) / 2,
    (rect.south + rect.north) / 2,
    0,
    ellipsoid,
  );
  Cartesian3.normalize(center, center);
  const out = new Float32Array(terrain.length);
  const point = new Cartesian3();
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      Cartesian3.fromDegrees(lonAt(col), latAt(row), 0, ellipsoid, point);
      Cartesian3.normalize(point, point);
      const i = row * GRID + col;
      out[i] = (MEAN_RADIUS + terrain[i]) * Cartesian3.dot(center, point);
    }
  }
  return out;
}

/** Mean Earth radius, meters, for {@link curvedTerrain}. */
const MEAN_RADIUS = 6_371_000;

/**
 * A horizon point for tiles too wide for one (Cesium finds none when a tile spans a hemisphere): a
 * point far out along the direction of the tile rectangle's center, in scaled space.
 *
 * Seen from a camera, a point that far away is above the horizon exactly when the camera's view of
 * the ground reaches within 90° of the tile's center, which is where a 180°-wide tile's edge is, so
 * the tile is culled only when no part of it can be seen. The direction must come from the
 * rectangle, not from the bounding sphere: a hemisphere's bounding sphere is centered near the
 * middle of the Earth, where its direction means nothing.
 */
export function farHorizonPoint(rect) {
  const center = Cartesian3.fromDegrees(
    (rect.west + rect.east) / 2,
    (rect.south + rect.north) / 2,
    0,
    ellipsoid,
  );
  const scaled = ellipsoid.transformPositionToScaledSpace(center, new Cartesian3());
  return Cartesian3.multiplyByScalar(Cartesian3.normalize(scaled, scaled), FAR, scaled);
}

/** How far out {@link farHorizonPoint} puts its point, in Earth radii. */
const FAR = 1e6;
