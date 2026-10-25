import type { components } from '../../api/generated/schema';
import type {
  AggregationStyle,
  CircleStyle,
  ColorCase,
  ColorRule,
  FeatureFilter,
  FillStyle,
  GeometryKind,
  IconStyle,
  KindStyle,
  LineStyle,
  SourceLayer,
  StyleModel,
  ZoomValue,
} from './model';
import { iconsOf } from './model';

/** The overlay style document `getMapStyle` returns. */
export type MapStyle = components['schemas']['MapStyle'];

/** A MapLibre layer as the style document carries it. */
type StyleLayer = Record<string, unknown>;

/** MapLibre geometry-type names, by the family this model groups them in. */
const GEOMETRY_TYPES: Record<string, GeometryKind> = {
  Point: 'point',
  MultiPoint: 'point',
  LineString: 'line',
  MultiLineString: 'line',
  Polygon: 'polygon',
  MultiPolygon: 'polygon',
};

/**
 * Parses the backend's overlay style into a {@link StyleModel}.
 *
 * Each style layer is placed by its structure, not its id: `source-layer` names the requested layer
 * (its `metadata.foresignal.layers` entry); a layer whose `source` differs from that is the layer's
 * hexagon aggregation; the kind comes from the filter's `kind` clause, or is the layer's only kind;
 * the role comes from the layer type and the filter's geometry (a `line` over polygons is an
 * outline). A layer that cannot be placed is listed in `skipped` rather than failing the parse.
 */
export function parseOverlayStyle(style: MapStyle): StyleModel {
  const meta = style.metadata.foresignal;
  const layers: SourceLayer[] = (meta?.layers ?? []).map((entry) => {
    const source = asRecord(style.sources[entry.id]);
    const layer: SourceLayer = { id: entry.id, kinds: [...entry.kinds] };
    if (entry.attribution) layer.attribution = entry.attribution;
    if (typeof entry.minzoom === 'number') layer.minzoom = entry.minzoom;
    if (typeof entry.aggBelowZoom === 'number') layer.aggBelowZoom = entry.aggBelowZoom;
    if (typeof source?.url === 'string') layer.tileJsonUrl = source.url;
    return layer;
  });
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const styles: KindStyle[] = [];
  const styleFor = (layerId: string, kind: string): KindStyle => {
    let found = styles.find((item) => item.layerId === layerId && item.kind === kind);
    if (!found) {
      found = { layerId, kind };
      styles.push(found);
    }
    return found;
  };
  const skipped: string[] = [];

  for (const raw of style.layers) {
    const layer = raw as StyleLayer;
    const id = String(layer.id);
    const sourceLayerId = typeof layer['source-layer'] === 'string' ? layer['source-layer'] : '';
    const owner = byId.get(sourceLayerId);
    if (!owner) {
      skipped.push(id);
      continue;
    }
    if (layer.source !== owner.id) {
      const aggregation = parseAggregation(layer, asRecord(style.sources[String(layer.source)]));
      if (aggregation) owner.aggregation = aggregation;
      else skipped.push(id);
      continue;
    }
    const filter = parseFilter(layer.filter);
    const kind = filter.kind ?? (owner.kinds.length === 1 ? owner.kinds[0] : undefined);
    if (!kind) {
      skipped.push(id);
      continue;
    }
    const target = styleFor(owner.id, kind);
    if (!placeGeometryStyle(target, layer, filter)) skipped.push(id);
  }

  const kinds = [...new Set(styles.map((item) => item.kind))].sort();
  const icons = [
    ...new Set(styles.flatMap((item) => (item.point?.type === 'icon' ? iconsOf(item.point) : []))),
  ].sort();
  const model: StyleModel = {
    generatedAt: meta?.generatedAt ?? '',
    spriteUrl: style.sprite,
    layers,
    styles,
    kinds,
    icons,
    skipped,
  };
  if (style.name) model.name = style.name;
  if (meta?.theme) model.theme = meta.theme;
  return model;
}

/** Puts one style layer into its (layer, kind) slot; false for a type this model does not draw. */
function placeGeometryStyle(target: KindStyle, layer: StyleLayer, filter: FeatureFilter): boolean {
  const layout = asRecord(layer.layout) ?? {};
  const paint = asRecord(layer.paint) ?? {};
  const base = { layerId: String(layer.id), filter, ...zoomRange(layer) };
  const polygonOnly = filter.geometry.length > 0 && filter.geometry.every((g) => g === 'polygon');
  switch (layer.type) {
    case 'symbol': {
      const image = parseIconImage(layout['icon-image']);
      if (!image) return false;
      const point: IconStyle = {
        ...base,
        type: 'icon',
        icon: image.icon,
        color: parseColor(paint['icon-color']),
      };
      if (image.iconMatch) point.iconMatch = image.iconMatch;
      if (typeof paint['icon-halo-color'] === 'string') point.haloColor = paint['icon-halo-color'];
      if (typeof paint['icon-halo-width'] === 'number') point.haloWidth = paint['icon-halo-width'];
      const rotateField = firstField(layout['icon-rotate']);
      if (rotateField) point.rotateField = rotateField;
      const alignment = layout['icon-rotation-alignment'];
      if (alignment === 'map' || alignment === 'viewport' || alignment === 'auto') {
        point.rotationAlignment = alignment;
      }
      target.point = point;
      return true;
    }
    case 'circle': {
      const point: CircleStyle = {
        ...base,
        type: 'circle',
        color: parseColor(paint['circle-color']),
      };
      const radius = parseZoomValue(paint['circle-radius']);
      if (radius !== undefined) point.radius = radius;
      const sizeField = firstField(paint['circle-radius']);
      if (sizeField) point.sizeField = sizeField;
      if (typeof paint['circle-opacity'] === 'number') point.opacity = paint['circle-opacity'];
      if (typeof paint['circle-stroke-color'] === 'string') {
        point.strokeColor = paint['circle-stroke-color'];
      }
      if (typeof paint['circle-stroke-width'] === 'number') {
        point.strokeWidth = paint['circle-stroke-width'];
      }
      target.point = point;
      return true;
    }
    case 'line': {
      const line: LineStyle = {
        ...base,
        type: 'line',
        color: parseColor(paint['line-color']),
        width: parseZoomValue(paint['line-width']) ?? 1,
      };
      if (polygonOnly) target.outline = line;
      else target.line = line;
      return true;
    }
    case 'fill': {
      const fill: FillStyle = { ...base, type: 'fill', color: parseColor(paint['fill-color']) };
      if (typeof paint['fill-opacity'] === 'number') fill.opacity = paint['fill-opacity'];
      target.fill = fill;
      return true;
    }
    default:
      return false;
  }
}

/** The hexagon-count layer, from a `fill` whose color interpolates over a count field. */
function parseAggregation(
  layer: StyleLayer,
  source: Record<string, unknown> | undefined,
): AggregationStyle | undefined {
  if (layer.type !== 'fill') return undefined;
  const paint = asRecord(layer.paint) ?? {};
  const color = paint['fill-color'];
  if (!Array.isArray(color) || color[0] !== 'interpolate') return undefined;
  const countField = firstField(color[2]);
  if (!countField) return undefined;
  const ramp: [number, string][] = [];
  for (let i = 3; i + 1 < color.length; i += 2) {
    const [count, value] = [color[i], color[i + 1]];
    if (typeof count !== 'number' || typeof value !== 'string') return undefined;
    ramp.push([count, value]);
  }
  const tiles = Array.isArray(source?.tiles)
    ? source.tiles.filter((t): t is string => typeof t === 'string')
    : [];
  const aggregation: AggregationStyle = {
    layerId: String(layer.id),
    tiles,
    countField,
    ramp,
    ...zoomRange(layer),
  };
  if (typeof paint['fill-opacity'] === 'number') aggregation.opacity = paint['fill-opacity'];
  if (typeof paint['fill-outline-color'] === 'string') {
    aggregation.outlineColor = paint['fill-outline-color'];
  }
  return aggregation;
}

/**
 * Reads a filter's geometry clause (`["match", ["geometry-type"], [types…], true, false]`) and its
 * kind clause (`["==", ["get", "kind"], kind]`), alone or inside `["all", …]`.
 */
export function parseFilter(raw: unknown): FeatureFilter {
  const filter: FeatureFilter = { geometry: [] };
  if (raw === undefined || raw === null) return filter;
  filter.raw = raw;
  const clauses = Array.isArray(raw) && raw[0] === 'all' ? raw.slice(1) : [raw];
  for (const clause of clauses) {
    if (!Array.isArray(clause)) continue;
    if (clause[0] === 'match' && isCall(clause[1], 'geometry-type') && clause[3] === true) {
      const types = Array.isArray(clause[2]) ? clause[2] : [clause[2]];
      for (const type of types) {
        const family = GEOMETRY_TYPES[String(type)];
        if (family && !filter.geometry.includes(family)) filter.geometry.push(family);
      }
    } else if (
      clause[0] === '==' &&
      isCall(clause[1], 'get') &&
      (clause[1] as unknown[])[1] === 'kind' &&
      typeof clause[2] === 'string'
    ) {
      filter.kind = clause[2];
    }
  }
  return filter;
}

/**
 * Reads a color: a string is a constant; `["match", input, values, color, …, fallback]` over a
 * `["get", field]` input is a match (case-insensitive when the input is `downcase`d); anything else
 * is kept as an expression.
 */
export function parseColor(raw: unknown): ColorRule {
  if (typeof raw === 'string') return { type: 'constant', color: raw };
  if (Array.isArray(raw) && raw[0] === 'match' && raw.length >= 5 && raw.length % 2 === 1) {
    const field = firstField(raw[1]);
    const fallback = raw[raw.length - 1];
    const cases: ColorCase[] = [];
    let valid = Boolean(field) && typeof fallback === 'string';
    for (let i = 2; valid && i + 1 < raw.length - 1; i += 2) {
      const values = Array.isArray(raw[i]) ? raw[i] : [raw[i]];
      const color = raw[i + 1];
      if (typeof color !== 'string' || !values.every((v: unknown) => typeof v === 'string')) {
        valid = false;
      } else {
        cases.push({ values: values as string[], color });
      }
    }
    if (valid && field && typeof fallback === 'string') {
      return {
        type: 'match',
        field,
        caseInsensitive: containsCall(raw[1], 'downcase'),
        cases,
        fallback,
      };
    }
  }
  return { type: 'expression', raw };
}

/**
 * Reads an `icon-image`: a string is the icon; `["match", input, values, icon, …, fallback]` over
 * a `["get", field]` input chooses the icon by that field, with the fallback as the icon. Undefined
 * for anything else, which this model does not draw.
 */
export function parseIconImage(raw: unknown): Pick<IconStyle, 'icon' | 'iconMatch'> | undefined {
  if (typeof raw === 'string') return { icon: raw };
  const rule = parseColor(raw);
  if (rule.type !== 'match') return undefined;
  return {
    icon: rule.fallback,
    iconMatch: {
      field: rule.field,
      caseInsensitive: rule.caseInsensitive,
      cases: rule.cases.map((item) => ({ values: item.values, icon: item.color })),
    },
  };
}

/**
 * Reads a size: a number, or `["interpolate", ["linear"], ["zoom"], z, v, …]` as a zoom ramp.
 * Returns undefined for anything else (a size driven by feature data).
 */
export function parseZoomValue(raw: unknown): ZoomValue | undefined {
  if (typeof raw === 'number') return raw;
  if (
    Array.isArray(raw) &&
    raw[0] === 'interpolate' &&
    isCall(raw[1], 'linear') &&
    isCall(raw[2], 'zoom')
  ) {
    const stops: [number, number][] = [];
    for (let i = 3; i + 1 < raw.length; i += 2) {
      if (typeof raw[i] !== 'number' || typeof raw[i + 1] !== 'number') return undefined;
      stops.push([raw[i] as number, raw[i + 1] as number]);
    }
    return { stops };
  }
  return undefined;
}

/** The first feature property an expression reads with `["get", name]`. */
export function firstField(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (raw[0] === 'get' && typeof raw[1] === 'string') return raw[1];
  for (const part of raw) {
    const found = firstField(part);
    if (found) return found;
  }
  return undefined;
}

/** True when `raw` is the expression call `[name, …]`. */
function isCall(raw: unknown, name: string): boolean {
  return Array.isArray(raw) && raw[0] === name;
}

/** True when the expression calls `name` anywhere inside it. */
function containsCall(raw: unknown, name: string): boolean {
  return Array.isArray(raw) && (raw[0] === name || raw.some((part) => containsCall(part, name)));
}

/** A layer's `minzoom` / `maxzoom`, when set. */
function zoomRange(layer: StyleLayer): { minzoom?: number; maxzoom?: number } {
  const range: { minzoom?: number; maxzoom?: number } = {};
  if (typeof layer.minzoom === 'number') range.minzoom = layer.minzoom;
  if (typeof layer.maxzoom === 'number') range.maxzoom = layer.maxzoom;
  return range;
}

/** The value as a plain object, or undefined. */
function asRecord(raw: unknown): Record<string, unknown> | undefined {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined;
}
