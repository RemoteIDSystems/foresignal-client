import { prettifyId } from '../../lib/labels';

/**
 * The overlay styling model: what the backend's MapLibre overlay style (`getMapStyle`) says about
 * how each record kind is drawn, in a form the layer pipeline (007, 010) and the legend can use
 * without a MapLibre runtime. Cesium does not read MapLibre styles, so this is the bridge.
 */

/** A geometry family a style layer draws. */
export type GeometryKind = 'point' | 'line' | 'polygon';

/** Which features a style layer applies to, from its `filter`. */
export interface FeatureFilter {
  /** The geometry families it accepts; empty when the filter does not restrict geometry. */
  geometry: GeometryKind[];
  /** The `kind` property it requires, for layers that carry several kinds. */
  kind?: string;
  /** The filter as the style gave it, for evaluators that need more than the fields above. */
  raw?: unknown;
}

/** One `match` case: the values that select a color. */
export interface ColorCase {
  /** Values compared with the feature's field (lowercased when the rule is case-insensitive). */
  values: string[];
  /** CSS color. */
  color: string;
}

/**
 * A color: one constant, a match on a feature field (the style's severity ramps), or an expression
 * this model does not interpret, kept as given.
 */
export type ColorRule =
  | { type: 'constant'; color: string }
  | {
      type: 'match';
      /** Feature property the match reads. */
      field: string;
      /** True when the style lowercases the value before matching. */
      caseInsensitive: boolean;
      cases: ColorCase[];
      /** Color when no case matches. */
      fallback: string;
    }
  | { type: 'expression'; raw: unknown };

/** A value interpolated linearly over zoom: `[zoom, value]` stops in ascending zoom. */
export interface ZoomRamp {
  stops: [number, number][];
}

/** A number that is either fixed or ramps with zoom. */
export type ZoomValue = number | ZoomRamp;

/** Shared by every geometry style: where it applies and its zoom range. */
interface GeometryStyleBase {
  /** The MapLibre layer id it came from. */
  layerId: string;
  filter: FeatureFilter;
  /** Lowest zoom it is drawn at, when the style limits it. */
  minzoom?: number;
  /** Zoom it stops being drawn at, when the style limits it. */
  maxzoom?: number;
}

/**
 * An icon chosen by a feature field: `["match", input, value, icon, …, fallback]` over a
 * `["get", field]` input, as the airports' chart symbols are.
 */
export interface IconMatch {
  /** Feature property the match reads. */
  field: string;
  /** True when the style lowercases the value before matching. */
  caseInsensitive: boolean;
  /** Values compared with the field, and the icon each selects. */
  cases: { values: string[]; icon: string }[];
}

/** A point drawn as an SDF icon from the sprite, tinted by `color`. */
export interface IconStyle extends GeometryStyleBase {
  type: 'icon';
  /** Sprite icon name; with `iconMatch`, the icon for a value no case names. */
  icon: string;
  /** The icon by a feature field, when the style chooses it per feature. */
  iconMatch?: IconMatch;
  color: ColorRule;
  haloColor?: string;
  haloWidth?: number;
  /** Feature property holding the heading in degrees, when the icon rotates. */
  rotateField?: string;
  /** Whether a rotated icon turns with the map (`map`) or stays upright on screen (`viewport`). */
  rotationAlignment?: 'map' | 'viewport' | 'auto';
}

/** A point drawn as a circle. */
export interface CircleStyle extends GeometryStyleBase {
  type: 'circle';
  color: ColorRule;
  /** Radius in pixels; undefined when it depends on data beyond zoom (see `sizeField`). */
  radius?: ZoomValue;
  /** Feature property that scales the radius, when the style sizes circles by data. */
  sizeField?: string;
  opacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

/** A line, or a polygon's outline. */
export interface LineStyle extends GeometryStyleBase {
  type: 'line';
  color: ColorRule;
  width: ZoomValue;
}

/** A polygon's fill. */
export interface FillStyle extends GeometryStyleBase {
  type: 'fill';
  color: ColorRule;
  opacity?: number;
}

/** How one source layer draws one record kind. */
export interface KindStyle {
  /** Source layer id (a `getMapStyle` / tile layer id). */
  layerId: string;
  kind: string;
  point?: IconStyle | CircleStyle;
  line?: LineStyle;
  fill?: FillStyle;
  outline?: LineStyle;
}

/** The hexagon-count layer a source switches to below its `aggBelowZoom`. */
export interface AggregationStyle {
  /** MapLibre layer id. */
  layerId: string;
  /** Tile URL templates of the aggregated (`agg=hex`) source. */
  tiles: string[];
  minzoom?: number;
  maxzoom?: number;
  /** Feature property holding the count. */
  countField: string;
  /** `[count, color]` stops, interpolated linearly. */
  ramp: [number, string][];
  opacity?: number;
  outlineColor?: string;
}

/** One requested tile layer, from `metadata.foresignal.layers` and its sources. */
export interface SourceLayer {
  id: string;
  kinds: string[];
  /** Attribution line the style gives for the layer. */
  attribution?: string;
  minzoom?: number;
  /** Zoom below which the layer is drawn as hexagon counts; undefined when it never is. */
  aggBelowZoom?: number;
  /** The layer's TileJSON URL. */
  tileJsonUrl?: string;
  aggregation?: AggregationStyle;
}

/** Everything the overlay style says, parsed. */
export interface StyleModel {
  name?: string;
  theme?: 'light' | 'dark';
  generatedAt: string;
  /** Sprite base URL (`…/v1/map/sprites/foresignal-{sha8}`). */
  spriteUrl: string;
  /** Requested layers, in the style's order. */
  layers: SourceLayer[];
  /** Every (layer, kind) style, in the style's order. */
  styles: KindStyle[];
  /** Kinds with at least one style, sorted. */
  kinds: string[];
  /** Every sprite icon the styles use, sorted. */
  icons: string[];
  /** Style layers this model could not place (an id it does not recognize), by id. */
  skipped: string[];
}

/** Returns a kind's styles, one per source layer that draws it. */
export function stylesForKind(model: StyleModel, kind: string): KindStyle[] {
  return model.styles.filter((style) => style.kind === kind);
}

/** Returns a source layer by id. */
export function sourceLayer(model: StyleModel, id: string): SourceLayer | undefined {
  return model.layers.find((layer) => layer.id === id);
}

/**
 * The color a rule gives a feature with these properties, or undefined for an uninterpreted
 * expression. A match reads the field as a string, as the style's `to-string` does, with a missing
 * field read as empty.
 */
export function colorFor(
  rule: ColorRule,
  properties: Record<string, unknown> = {},
): string | undefined {
  if (rule.type === 'constant') return rule.color;
  if (rule.type === 'expression') return undefined;
  const raw = properties[rule.field];
  let value = raw === undefined || raw === null ? '' : String(raw);
  if (rule.caseInsensitive) value = value.toLowerCase();
  return rule.cases.find((item) => item.values.includes(value))?.color ?? rule.fallback;
}

/**
 * The sprite icon a style draws for a feature with these properties: the matched case, else the
 * style's own icon. The field is read as a string, as the style's `to-string` does.
 */
export function iconFor(style: IconStyle, properties: Record<string, unknown> = {}): string {
  const match = style.iconMatch;
  if (!match) return style.icon;
  const raw = properties[match.field];
  let value = raw === undefined || raw === null ? '' : String(raw);
  if (match.caseInsensitive) value = value.toLowerCase();
  return match.cases.find((item) => item.values.includes(value))?.icon ?? style.icon;
}

/** Every icon a style can draw: its own and each case's. */
export function iconsOf(style: IconStyle): string[] {
  return [style.icon, ...(style.iconMatch?.cases.map((item) => item.icon) ?? [])];
}

/** The color a rule shows when nothing about the feature is known: the constant, or the fallback. */
export function representativeColor(rule: ColorRule): string | undefined {
  if (rule.type === 'constant') return rule.color;
  if (rule.type === 'match') return rule.fallback;
  return undefined;
}

/** The value at a zoom: fixed, or interpolated linearly between stops and held beyond the ends. */
export function valueAtZoom(value: ZoomValue, zoom: number): number {
  if (typeof value === 'number') return value;
  const { stops } = value;
  const first = stops[0];
  if (!first) return 0;
  if (zoom <= first[0]) return first[1];
  let previous = first;
  for (const [z1, v1] of stops.slice(1)) {
    const [z0, v0] = previous;
    if (zoom <= z1) return v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0);
    previous = [z1, v1];
  }
  return previous[1];
}

/** A readable label for a kind id (see {@link prettifyId}): `aprs-station` → `APRS Station`. */
export function kindLabel(kind: string): string {
  return prettifyId(kind);
}
