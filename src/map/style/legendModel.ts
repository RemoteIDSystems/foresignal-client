import {
  kindLabel,
  representativeColor,
  sourceLayer,
  stylesForKind,
  type ColorCase,
  type KindStyle,
  type StyleModel,
} from './model';

/** One way a kind is drawn, shared by one or more source layers. */
export interface LegendVariant {
  /** A style that shows the look (the first source's). */
  style: KindStyle;
  /** Source layer ids drawn this way. */
  layerIds: string[];
  /** Their distinct attribution lines (layer id when a layer has none). */
  sources: string[];
}

/** One kind in the legend. */
export interface LegendEntry {
  kind: string;
  label: string;
  /** Distinct looks, in the style's order. */
  variants: LegendVariant[];
  /** Severity-style color cases, when a variant colors by a feature field. */
  colorCases?: { field: string; cases: ColorCase[]; fallback: string };
  /** Lowest zoom any variant's point is drawn at, when every variant starts above zero. */
  minzoom?: number;
  /** Zoom below which some of its layers draw hexagon counts. */
  aggBelowZoom?: number;
  /** The hexagon color ramp for those layers. */
  aggRamp?: [number, string][];
}

/**
 * Which kinds the legend shows, and from which sources: kind → source layer ids, or `'*'` for
 * every source. Undefined shows every kind the style knows.
 */
export type LegendScope = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Groups the style model into legend entries: one per kind, sorted by label, each listing its
 * distinct looks (icon or circle, and representative color) with the sources that use them, the
 * field-driven color cases, and where it switches to hexagon counts. With a `scope` (the map's
 * enabled layers) only those kinds appear, each with only the looks of the sources drawn, or the
 * kind's first look when none of those sources is styled (the look the map falls back to). `filter`
 * keeps kinds whose label, id or source text contains it, case-insensitively.
 */
export function buildLegend(model: StyleModel, filter = '', scope?: LegendScope): LegendEntry[] {
  const needle = filter.trim().toLowerCase();
  const kinds = scope ? model.kinds.filter((kind) => scope.has(kind)) : model.kinds;
  const entries = kinds.map((kind) => buildEntry(model, kind, scope?.get(kind)));
  return entries
    .filter((entry) => entry.variants.length > 0)
    .filter(
      (entry) =>
        !needle ||
        entry.label.toLowerCase().includes(needle) ||
        entry.kind.includes(needle) ||
        entry.variants.some((v) => v.sources.some((s) => s.toLowerCase().includes(needle))),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Builds one kind's entry. */
function buildEntry(model: StyleModel, kind: string, sources?: ReadonlySet<string>): LegendEntry {
  const variants: LegendVariant[] = [];
  const byLook = new Map<string, LegendVariant>();
  const entry: LegendEntry = { kind, label: kindLabel(kind), variants };
  let minzoom = Infinity;
  const forKind = stylesForKind(model, kind);
  const scoped =
    !sources || sources.has('*') ? forKind : forKind.filter((style) => sources.has(style.layerId));
  // Sources the style does not draw are drawn in the kind's first style (see `styleForRecord`).
  const shown = scoped.length > 0 ? scoped : forKind.slice(0, 1);
  for (const style of shown) {
    const key = lookKey(style);
    let variant = byLook.get(key);
    if (!variant) {
      variant = { style, layerIds: [], sources: [] };
      byLook.set(key, variant);
      variants.push(variant);
    }
    const layer = sourceLayer(model, style.layerId);
    variant.layerIds.push(style.layerId);
    const source = layer?.attribution ?? style.layerId;
    if (!variant.sources.includes(source)) variant.sources.push(source);
    const color = style.point?.color ?? style.line?.color ?? style.fill?.color;
    if (!entry.colorCases && color?.type === 'match') {
      entry.colorCases = { field: color.field, cases: color.cases, fallback: color.fallback };
    }
    minzoom = Math.min(minzoom, style.point?.minzoom ?? 0);
    if (layer?.aggBelowZoom !== undefined && entry.aggBelowZoom === undefined) {
      entry.aggBelowZoom = layer.aggBelowZoom;
      if (layer.aggregation) entry.aggRamp = layer.aggregation.ramp;
    }
  }
  if (Number.isFinite(minzoom) && minzoom > 0) entry.minzoom = minzoom;
  return entry;
}

/** The detail a row's tooltip shows: the sources per look, then the zoom notes. */
export function legendTooltip(entry: LegendEntry): string {
  const lines = entry.variants.map((variant) => variant.sources.join(' · '));
  for (const note of zoomNotes(entry)) lines.push(note);
  return lines.join('\n');
}

/** The zoom facts of an entry, as sentences: where it turns into hexagon counts, or starts. */
export function zoomNotes(entry: LegendEntry): string[] {
  if (entry.aggBelowZoom !== undefined) return [`Hexagon counts below zoom ${entry.aggBelowZoom}`];
  if (entry.minzoom !== undefined) return [`From zoom ${entry.minzoom}`];
  return [];
}

/** What makes two styles look the same in the legend. */
function lookKey(style: KindStyle): string {
  const point = style.point;
  const shape = point ? (point.type === 'icon' ? `icon:${point.icon}` : 'circle') : 'none';
  const color = point?.color ?? style.line?.color ?? style.fill?.color;
  const shown = color ? (representativeColor(color) ?? JSON.stringify(color)) : '';
  return `${shape}|${shown}`;
}
