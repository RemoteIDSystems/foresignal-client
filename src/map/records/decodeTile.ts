import { classifyRings, VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { tilePointToLonLat, type TileId } from './tileMath';

/** A feature property value as a vector tile carries it. */
export type PropertyValue = number | string | boolean;

/** The geometry families a record tile carries. */
export type RecordGeometry =
  | { type: 'point'; points: [number, number][] }
  | { type: 'line'; lines: [number, number][][] }
  /** Polygons, each an outer ring followed by its holes; rings are closed. */
  | { type: 'polygon'; polygons: [number, number][][][] };

/** One record from a tile, its coordinates in degrees (longitude, latitude). */
export interface RecordFeature {
  /** The tile layer the feature came from (the source or kind id). */
  layer: string;
  properties: Record<string, PropertyValue>;
  geometry: RecordGeometry;
}

/**
 * Decodes a record tile (`getTile`, Mapbox Vector Tile 2) into features with geographic
 * coordinates. Every layer in the tile is read. Points in the tile's buffer (outside its own
 * square) are dropped, so a point near a tile edge is drawn once, by the tile that owns it; lines
 * and polygons keep their buffered parts so they join their neighbors. An empty body decodes to no
 * features.
 */
export function decodeTile(data: ArrayBuffer | Uint8Array, tile: TileId): RecordFeature[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength === 0) return [];
  const vectorTile = new VectorTile(new PbfReader(bytes));
  const features: RecordFeature[] = [];
  for (const [name, layer] of Object.entries(vectorTile.layers)) {
    const extent = layer.extent;
    const toLonLat = (p: { x: number; y: number }) => tilePointToLonLat(tile, extent, p.x, p.y);
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const rings = feature.loadGeometry();
      let geometry: RecordGeometry | undefined;
      if (feature.type === 1) {
        const points = rings
          .flat()
          .filter((p) => p.x >= 0 && p.x < extent && p.y >= 0 && p.y < extent)
          .map(toLonLat);
        if (points.length) geometry = { type: 'point', points };
      } else if (feature.type === 2) {
        const lines = rings.filter((line) => line.length >= 2).map((line) => line.map(toLonLat));
        if (lines.length) geometry = { type: 'line', lines };
      } else if (feature.type === 3) {
        const polygons = classifyRings(rings)
          .map((polygon) => polygon.filter((ring) => ring.length >= 4).map((r) => r.map(toLonLat)))
          .filter((polygon) => polygon.length > 0);
        if (polygons.length) geometry = { type: 'polygon', polygons };
      }
      if (geometry) features.push({ layer: name, properties: feature.properties, geometry });
    }
  }
  return features;
}
