import type { components } from '../../api/generated/schema';
import {
  categoryOf,
  DEFAULT_CATEGORIES,
  KIND_CATEGORIES,
  type CategoryId,
} from '../../lib/kindCategories';
import { prettifyId } from '../../lib/labels';
import { sourceLayer, stylesForKind, type KindStyle, type StyleModel } from '../style/model';

/** One entry of `listTileLayers`. */
export type TileLayerSummary = components['schemas']['TileLayerIndex']['layers'][number];
/** One entry of `listKinds`. */
export type KindSummary = components['schemas']['KindSummary'];

/** A record kind as the rail shows it: one toggle, drawn from the kind's merged tile layer. */
export interface KindEntry {
  /** The kind, which is also its tile layer id. */
  id: string;
  /** Display name, from the 006 prettifier. */
  label: string;
  /** The rail category it is listed under. */
  category: CategoryId;
  /** The sources that supply its records now (`listKinds`); empty when it has none. */
  sources: string[];
  /** The style that gives the kind its icon: a current source's, else any source's. */
  swatch?: KindStyle;
  /** Records it has now (`listKinds` `currentCount`); 0 when it is not listed. */
  count: number;
  /** Records in the map's view (`summarizeContext` `layerCounts`), once a summary is in. */
  viewCount?: number;
  /** Zoom below which it is drawn as hexagon counts (008); undefined for never. */
  aggBelowZoom?: number;
}

/** A category of kinds, as the rail's top-level rows. */
export interface CategoryGroup {
  id: CategoryId;
  label: string;
  /** Its kinds, most records first, then by label. */
  kinds: KindEntry[];
  /** Records across its kinds now. */
  count: number;
  /** Records across its kinds in the map's view, once a summary is in. */
  viewCount?: number;
}

/** A source, as the FILTERS tab offers it. */
export interface SourceEntry {
  id: string;
  /** The backend's name for it. */
  label: string;
  /** The kinds it draws, from the overlay style. */
  kinds: string[];
  /** Records it has now, when it is the only source of each of its kinds; else undefined. */
  count?: number;
}

/** What the rail lists: kinds grouped by category, and the sources to filter them by. */
export interface LayerCatalog {
  /** The non-empty categories, in the Global mock's order. */
  categories: CategoryGroup[];
  /** Every kind, in the index's order. */
  kinds: KindEntry[];
  /** Every source layer. */
  sources: SourceEntry[];
}

/**
 * Builds the rail from the tile layer index, the current kinds and the overlay style. Kind layers
 * become the toggles, grouped by the client's category table (`lib/kindCategories`); source
 * layers become the FILTERS tab's sources, so a record is only ever drawn once, by its kind.
 */
export function buildCatalog(
  index: readonly TileLayerSummary[],
  kinds: readonly KindSummary[],
  model: StyleModel | undefined,
): LayerCatalog {
  const byKind = new Map(kinds.map((summary) => [summary.kind, summary]));
  const kindEntries = index
    .filter((layer) => layer.type === 'kind')
    .map((layer): KindEntry => {
      const sources = byKind.get(layer.id)?.sources ?? [];
      return {
        id: layer.id,
        label: prettifyId(layer.id),
        category: categoryOf(layer.id),
        sources,
        swatch: model ? kindSwatch(model, layer.id, sources) : undefined,
        count: byKind.get(layer.id)?.currentCount ?? 0,
        aggBelowZoom: layer.aggBelowZoom ?? undefined,
      };
    });
  const sources = index
    .filter((layer) => layer.type === 'source')
    .map((layer): SourceEntry => {
      const sourceKinds = (model && sourceLayer(model, layer.id)?.kinds) ?? [];
      return {
        id: layer.id,
        label: layer.name.trim() || prettifyId(layer.id),
        kinds: sourceKinds,
        count: sourceCount(layer.id, sourceKinds, byKind),
      };
    });
  const order = (a: KindEntry, b: KindEntry) =>
    b.count - a.count || a.label.localeCompare(b.label, 'en');
  const categories = KIND_CATEGORIES.map((category): CategoryGroup => {
    const members = kindEntries.filter((entry) => entry.category === category.id).sort(order);
    return {
      id: category.id,
      label: category.label,
      kinds: members,
      count: members.reduce((sum, entry) => sum + entry.count, 0),
    };
  }).filter((group) => group.kinds.length > 0);
  return { categories, kinds: kindEntries, sources };
}

/**
 * The style a kind's icon comes from: the style of a source that supplies the kind now, so the
 * rail and legend show what the map draws; else the first style for the kind.
 */
function kindSwatch(
  model: StyleModel,
  kind: string,
  sources: readonly string[],
): KindStyle | undefined {
  const styles = stylesForKind(model, kind);
  return styles.find((style) => sources.includes(style.layerId)) ?? styles[0];
}

/** A source's record count when it is the only source of each of its kinds. */
function sourceCount(
  id: string,
  kinds: readonly string[],
  byKind: ReadonlyMap<string, KindSummary>,
): number | undefined {
  if (kinds.length === 0) return undefined;
  let total = 0;
  for (const kind of kinds) {
    const summary = byKind.get(kind);
    if (!summary) continue;
    if (summary.sources.length !== 1 || summary.sources[0] !== id) return undefined;
    total += summary.currentCount;
  }
  return total;
}

/**
 * The catalog with each kind's and category's records in the map's view, from the viewport
 * summary's per-layer counts (aggregates, never features). A kind the summary does not list has
 * none in view. Without counts the catalog is returned as it is. The order is kept, so the rail
 * does not reshuffle as the map pans.
 */
export function withViewCounts(
  catalog: LayerCatalog,
  counts: ReadonlyMap<string, number> | undefined,
): LayerCatalog {
  if (!counts) return catalog;
  const inView = (entry: KindEntry): KindEntry => ({
    ...entry,
    viewCount: counts.get(entry.id) ?? 0,
  });
  const categories = catalog.categories.map((group) => {
    const kinds = group.kinds.map(inView);
    return { ...group, kinds, viewCount: kinds.reduce((sum, k) => sum + (k.viewCount ?? 0), 0) };
  });
  return { ...catalog, categories, kinds: catalog.kinds.map(inView) };
}

/** The count the rail shows: records in view once known, else records anywhere now. */
export function shownCount(entry: { count: number; viewCount?: number }): number {
  return entry.viewCount ?? entry.count;
}

/** The kinds on when the dashboard opens: those of the categories the Global mock shows checked. */
export function defaultEnabled(catalog: LayerCatalog): string[] {
  return catalog.kinds
    .filter((entry) => DEFAULT_CATEGORIES.includes(entry.category))
    .map((entry) => entry.id);
}

/**
 * The tile layers to draw: the enabled kinds that have records now. A kind with none would only
 * fetch empty tiles; it is drawn once `listKinds` lists it (the catalog refreshes its counts).
 */
export function drawnLayers(catalog: LayerCatalog, enabled: ReadonlySet<string>): string[] {
  return catalog.kinds
    .filter((entry) => enabled.has(entry.id) && entry.count > 0)
    .map((entry) => entry.id);
}

/**
 * What the map shows, for the legend: each drawn kind with the sources it is drawn from now, less
 * the sources the FILTERS tab hides. A kind whose every source is hidden is not on the map.
 */
export function enabledKinds(
  catalog: LayerCatalog,
  enabled: ReadonlySet<string>,
  hiddenSources: ReadonlySet<string> = new Set(),
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const entry of catalog.kinds) {
    if (!enabled.has(entry.id) || entry.count === 0) continue;
    // Should listKinds not name a counted kind's sources, any source's look stands for it.
    if (entry.sources.length === 0) {
      out.set(entry.id, new Set(['*']));
      continue;
    }
    const shown = entry.sources.filter((source) => !hiddenSources.has(source));
    if (shown.length > 0) out.set(entry.id, new Set(shown));
  }
  return out;
}

/** A source as the FILTERS tab lists it, for the kinds that are on. */
export interface FilterSource extends SourceEntry {
  /** True when it supplies an enabled kind's records now. */
  live: boolean;
}

/**
 * The sources the FILTERS tab offers: those that draw an enabled kind, by the overlay style or by
 * `listKinds`. The ones supplying records now come first, then by count and name.
 */
export function filterSources(catalog: LayerCatalog, enabled: ReadonlySet<string>): FilterSource[] {
  const liveSources = new Set(
    catalog.kinds.filter((entry) => enabled.has(entry.id)).flatMap((entry) => entry.sources),
  );
  return catalog.sources
    .filter(
      (source) => liveSources.has(source.id) || source.kinds.some((kind) => enabled.has(kind)),
    )
    .map((source) => ({ ...source, live: liveSources.has(source.id) }))
    .sort(
      (a, b) =>
        Number(b.live) - Number(a.live) ||
        (b.count ?? -1) - (a.count ?? -1) ||
        a.label.localeCompare(b.label, 'en'),
    );
}
