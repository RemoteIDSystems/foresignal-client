/**
 * Builds the client's self-hosted 3D terrain: quantized-mesh-1.0 tiles plus `layer.json`, from a
 * global elevation GeoTIFF (NOAA ETOPO 2022, 60 arc-second, ice surface). See
 * `public/terrain/README.md` for the source file, checksums and the exact command.
 *
 * Usage: node scripts/build-terrain.mjs SOURCE.tif OUT_DIR MAX_LEVEL [ERROR_FACTOR] [LEAF_ERROR]
 *
 * ERROR_FACTOR scales each level's error budget against Cesium's geometric error for that level
 * (default 0.5): smaller keeps more triangles and makes bigger tiles. LEAF_ERROR, in meters, caps
 * the budget at MAX_LEVEL, the level the elevation readout and close views use (default: no cap).
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fromFile } from 'geotiff';
import { encodeTile } from './terrain/quantized-mesh.mjs';
import {
  buildTile,
  ElevationGrid,
  levelGeometricError,
  pyramid,
  tileCounts,
} from './terrain/tiles.mjs';

const [source, out, maxLevelArg, factorArg, leafArg] = process.argv.slice(2);
if (!source || !out || maxLevelArg === undefined) {
  console.error(
    'Usage: node scripts/build-terrain.mjs SOURCE.tif OUT_DIR MAX_LEVEL [ERROR_FACTOR] [LEAF_ERROR]',
  );
  process.exit(2);
}
const maxLevel = Number(maxLevelArg);
const factor = factorArg === undefined ? 0.5 : Number(factorArg);
const leafError = leafArg === undefined ? Infinity : Number(leafArg);

const image = await (await fromFile(source)).getImage();
const [width, height] = [image.getWidth(), image.getHeight()];
const [originX, originY] = image.getOrigin();
const [resX, resY] = image.getResolution();
console.log(`source ${width}×${height}, origin ${originX},${originY}, cell ${resX},${resY}`);
if (
  Math.abs(originX + 180) > 1e-6 ||
  Math.abs(originY - 90) > 1e-6 ||
  Math.abs(resX * width - 360) > 1e-6
) {
  throw new Error('Expected a whole-world grid starting at 180°W, 90°N.');
}
const [raster] = await image.readRasters();
const levels = pyramid(new ElevationGrid(width, height, Float32Array.from(raster)));
console.log(`pyramid ${levels.map((l) => l.width).join(', ')}`);

// Replace the previous build's levels and layer.json; anything else in OUT_DIR (its README) stays.
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out)) {
  if (/^\d+$/.test(entry) || entry === 'layer.json') rmSync(`${out}/${entry}`, { recursive: true });
}
const available = [];
let totalBytes = 0;
let totalTiles = 0;
for (let level = 0; level <= maxLevel; level++) {
  const { columns, rows } = tileCounts(level);
  const budget = levelGeometricError(level) * factor;
  const maxError = level === maxLevel ? Math.min(budget, leafError) : budget;
  let bytes = 0;
  let vertices = 0;
  for (let x = 0; x < columns; x++) {
    mkdirSync(`${out}/${level}/${x}`, { recursive: true });
    for (let y = 0; y < rows; y++) {
      const tile = buildTile(levels, level, x, y, maxError);
      const encoded = encodeTile(tile);
      writeFileSync(`${out}/${level}/${x}/${y}.terrain`, encoded);
      bytes += encoded.length;
      vertices += tile.u.length;
    }
  }
  available.push([{ startX: 0, startY: 0, endX: columns - 1, endY: rows - 1 }]);
  totalBytes += bytes;
  totalTiles += columns * rows;
  console.log(
    `level ${level}: ${columns * rows} tiles, ${bytes} bytes, ` +
      `${Math.round(vertices / (columns * rows))} vertices/tile, error ${maxError.toFixed(0)} m`,
  );
}

writeFileSync(
  `${out}/layer.json`,
  `${JSON.stringify(
    {
      tilejson: '2.1.0',
      name: 'foresignal-terrain',
      description: 'NOAA ETOPO 2022 60 arc-second ice surface elevation, quantized-mesh',
      version: '1.0.0',
      format: 'quantized-mesh-1.0',
      attribution: 'NOAA National Centers for Environmental Information, ETOPO 2022',
      scheme: 'tms',
      tiles: ['{z}/{x}/{y}.terrain'],
      projection: 'EPSG:4326',
      bounds: [-180, -90, 180, 90],
      minzoom: 0,
      maxzoom: maxLevel,
      available,
    },
    null,
    2,
  )}\n`,
);
console.log(`total ${totalTiles} tiles, ${totalBytes} bytes`);
