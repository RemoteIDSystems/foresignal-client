import { PbfWriter } from 'pbf';

/** A feature to encode, its geometry in the tile's own coordinates (0..extent). */
export interface TestFeature {
  type: 'point' | 'line' | 'polygon';
  /** Points, lines, or polygon rings (outer rings clockwise in tile coordinates, holes the other way). */
  geometry: [number, number][][];
  properties?: Record<string, string | number | boolean>;
}

/** One layer to encode. */
export interface TestLayer {
  name: string;
  extent?: number;
  features: TestFeature[];
}

const GEOMETRY_TYPES = { point: 1, line: 2, polygon: 3 } as const;

/**
 * Encodes layers as a Mapbox Vector Tile 2, the format `getTile` serves. Test and verification
 * use only: it writes exactly the fields the spec requires, so tests can build lines, polygons with
 * holes and buffered points that the live data does not have.
 */
export function encodeTile(layers: TestLayer[]): Uint8Array {
  const pbf = new PbfWriter();
  for (const layer of layers) pbf.writeMessage(3, writeLayer, layer);
  return pbf.finish();
}

function writeLayer(layer: TestLayer, pbf: PbfWriter) {
  const keys: string[] = [];
  const values: (string | number | boolean)[] = [];
  const index = <T>(list: T[], value: T) => {
    const i = list.indexOf(value);
    if (i >= 0) return i;
    list.push(value);
    return list.length - 1;
  };
  pbf.writeVarintField(15, 2);
  pbf.writeStringField(1, layer.name);
  pbf.writeVarintField(5, layer.extent ?? 4096);
  for (const feature of layer.features) {
    const tags: number[] = [];
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
      tags.push(index(keys, key), index(values, value));
    }
    pbf.writeMessage(2, writeFeature, { feature, tags });
  }
  for (const key of keys) pbf.writeStringField(3, key);
  for (const value of values) pbf.writeMessage(4, writeValue, value);
}

function writeFeature({ feature, tags }: { feature: TestFeature; tags: number[] }, pbf: PbfWriter) {
  pbf.writePackedVarint(2, tags);
  pbf.writeVarintField(3, GEOMETRY_TYPES[feature.type]);
  pbf.writePackedVarint(4, encodeGeometry(feature));
}

function writeValue(value: string | number | boolean, pbf: PbfWriter) {
  if (typeof value === 'string') pbf.writeStringField(1, value);
  else if (typeof value === 'boolean') pbf.writeBooleanField(7, value);
  else pbf.writeDoubleField(3, value);
}

const zigzag = (n: number) => (n << 1) ^ (n >> 31);
const command = (id: number, count: number) => (id & 7) | (count << 3);

/** The MVT command stream for a feature's geometry, with delta-encoded cursor moves. */
function encodeGeometry(feature: TestFeature): number[] {
  const out: number[] = [];
  let cx = 0;
  let cy = 0;
  const moveTo = ([x, y]: [number, number]) => {
    out.push(zigzag(x - cx), zigzag(y - cy));
    cx = x;
    cy = y;
  };
  if (feature.type === 'point') {
    const points = feature.geometry.flat();
    out.push(command(1, points.length));
    points.forEach(moveTo);
    return out;
  }
  for (const part of feature.geometry) {
    const ring = feature.type === 'polygon' ? part.slice(0, -1) : part;
    const [first, ...rest] = ring;
    if (!first) continue;
    out.push(command(1, 1));
    moveTo(first);
    out.push(command(2, rest.length));
    rest.forEach(moveTo);
    if (feature.type === 'polygon') out.push(command(7, 1));
  }
  return out;
}
