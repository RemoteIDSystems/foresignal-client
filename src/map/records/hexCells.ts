import { stylesForKind, sourceLayer, type AggregationStyle, type StyleModel } from '../style/model';
import type { RecordFeature } from './decodeTile';

/** One aggregate cell: its outline (longitude/latitude, closed) and the records it counts. */
export interface HexCell {
  /** Identifies the cell across tiles: its center, rounded. */
  key: string;
  ring: [number, number][];
  count: number;
}

/** Decimal places a cell center is rounded to, to match one cell sent by two tiles. */
const KEY_PLACES = 5;

/**
 * The aggregate cells of a decoded `agg=hex` (or `grid`) tile: one per polygon carrying a numeric
 * `count`. Anything else in the tile is ignored.
 */
export function cellsOfTile(features: readonly RecordFeature[]): HexCell[] {
  const cells: HexCell[] = [];
  for (const feature of features) {
    const count = feature.properties.count;
    if (feature.geometry.type !== 'polygon' || typeof count !== 'number' || count <= 0) continue;
    for (const polygon of feature.geometry.polygons) {
      const ring = polygon[0];
      if (!ring || ring.length < 3) continue;
      cells.push({ key: cellKey(ring), ring, count });
    }
  }
  return cells;
}

/** A cell's key: the mean of its distinct vertices, rounded. */
export function cellKey(ring: readonly [number, number][]): string {
  const [first] = ring;
  const last = ring[ring.length - 1];
  const closed = first && last && first[0] === last[0] && first[1] === last[1];
  const points = closed ? ring.slice(0, -1) : ring;
  let lon = 0;
  let lat = 0;
  for (const [x, y] of points) {
    lon += x;
    lat += y;
  }
  return `${(lon / points.length).toFixed(KEY_PLACES)},${(lat / points.length).toFixed(KEY_PLACES)}`;
}

/**
 * A layer's aggregate cells across its tiles. The backend sends a hexagon that straddles a tile
 * edge in both tiles, each counting the records on its own side, so the same cell is merged here
 * into one with the summed count rather than drawn twice on top of itself.
 */
export class HexCellIndex {
  private readonly byTile = new Map<string, HexCell[]>();

  /** Sets one tile's cells, replacing what it had. */
  set(tile: string, cells: HexCell[]): void {
    this.byTile.set(tile, cells);
  }

  /** Forgets one tile's cells. */
  delete(tile: string): boolean {
    return this.byTile.delete(tile);
  }

  /** True when the tile's cells are held. */
  has(tile: string): boolean {
    return this.byTile.has(tile);
  }

  /** The tiles held. */
  tiles(): string[] {
    return [...this.byTile.keys()];
  }

  /** Every cell once, with its count summed over the tiles that sent it. */
  merged(): HexCell[] {
    const out = new Map<string, HexCell>();
    for (const cells of this.byTile.values()) {
      for (const cell of cells) {
        const seen = out.get(cell.key);
        if (seen) seen.count += cell.count;
        else out.set(cell.key, { ...cell });
      }
    }
    return [...out.values()];
  }
}

/** The look of a kind's aggregate cells when the style gives none: a gray count ramp. */
export const DEFAULT_AGGREGATION: Pick<AggregationStyle, 'ramp' | 'opacity' | 'outlineColor'> = {
  ramp: [
    [1, '#CED4DA'],
    [10, '#ADB5BD'],
    [100, '#868E96'],
    [1000, '#495057'],
  ],
  opacity: 0.6,
  outlineColor: '#FFFFFF',
};

/**
 * The aggregation style of a kind layer: that of a source drawing the kind, preferring one that
 * supplies it now, as the overlay style gives it for the source's `--agg` layer. Undefined when no
 * source of the kind has one.
 */
export function aggregationFor(
  model: StyleModel,
  kind: string,
  sources: readonly string[] = [],
): AggregationStyle | undefined {
  const layers = [...new Set(stylesForKind(model, kind).map((style) => style.layerId))];
  layers.sort((a, b) => Number(sources.includes(b)) - Number(sources.includes(a)));
  for (const id of layers) {
    const aggregation = sourceLayer(model, id)?.aggregation;
    if (aggregation) return aggregation;
  }
  return undefined;
}

/**
 * The color a count takes on a `[count, color]` ramp, interpolated linearly between stops as
 * MapLibre's `interpolate linear` does, and held at the ends. Colors are `#RRGGBB`.
 */
export function rampColor(ramp: readonly [number, string][], count: number): string {
  const first = ramp[0];
  if (!first) return '#888888';
  if (count <= first[0]) return first[1];
  for (let i = 1; i < ramp.length; i++) {
    const [stop, color] = ramp[i]!;
    if (count <= stop) {
      const [lastStop, lastColor] = ramp[i - 1]!;
      return mix(lastColor, color, (count - lastStop) / (stop - lastStop));
    }
  }
  return ramp[ramp.length - 1]![1];
}

/** Mixes two `#RRGGBB` colors; `t` 0 is `a`, 1 is `b`. */
function mix(a: string, b: string, t: number): string {
  const channel = (color: string, at: number) => parseInt(color.slice(at, at + 2), 16);
  const out = [1, 3, 5].map((at) =>
    Math.round(channel(a, at) + (channel(b, at) - channel(a, at)) * t)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${out.join('').toUpperCase()}`;
}
