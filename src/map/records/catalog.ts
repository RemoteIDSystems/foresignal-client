import type { components } from '../../api/generated/schema';
import { prettifyId } from '../../lib/labels';
import { sourceLayer, stylesForKind, type KindStyle, type StyleModel } from '../style/model';

/** One entry of `listTileLayers`. */
export type TileLayerSummary = components['schemas']['TileLayerIndex']['layers'][number];
/** One entry of `listKinds`. */
export type KindSummary = components['schemas']['KindSummary'];

/** A record layer as the rail shows it. */
export interface LayerEntry {
  /** The layer id: a source id or a kind. */
  id: string;
  /** `kind` layers merge every source of one kind; `source` layers are one feed. */
  type: 'kind' | 'source';
  /** Display name: the backend's name for a source, the prettified id for a kind. */
  label: string;
  /** The kinds the layer draws. */
  kinds: string[];
  /**
   * For a kind layer, the sources that supply its records now (`listKinds`); empty when it has
   * none, in which case any source's style stands for it.
   */
  sources: string[];
  /** The style that gives the layer its icon, when the overlay style has one. */
  swatch?: KindStyle;
  /**
   * Records the layer has now, from `listKinds`; undefined when that cannot be told (a source
   * whose kinds other sources share). Per-view counts come in 008.
   */
  count?: number;
  /** Zoom below which the layer is drawn as hexagon counts (008); undefined for never. */
  aggBelowZoom?: number;
}

/** The rail's two lists. */
export interface LayerCatalog {
  kinds: LayerEntry[];
  sources: LayerEntry[];
}

/**
 * Builds the rail's layers from the tile layer index, the current kinds with their counts, and
 * the overlay style (for icons and a source's kinds). A kind's count is its `currentCount`, and 0
 * when `listKinds` does not list it (it lists only kinds present now). A source's count is the sum
 * over its kinds when it is the only source of each; otherwise it is unknown. Each list is sorted
 * by count, largest first, then by label.
 */
export function buildCatalog(
  index: readonly TileLayerSummary[],
  kinds: readonly KindSummary[],
  model: StyleModel | undefined,
): LayerCatalog {
  const byKind = new Map(kinds.map((summary) => [summary.kind, summary]));
  const entries = index.map((layer): LayerEntry => {
    const aggBelowZoom = layer.aggBelowZoom ?? undefined;
    if (layer.type === 'kind') {
      const sources = byKind.get(layer.id)?.sources ?? [];
      return {
        id: layer.id,
        type: 'kind',
        label: prettifyId(layer.id),
        kinds: [layer.id],
        sources,
        swatch: model ? kindSwatch(model, layer.id, sources) : undefined,
        count: byKind.get(layer.id)?.currentCount ?? 0,
        aggBelowZoom,
      };
    }
    const layerKinds = (model && sourceLayer(model, layer.id)?.kinds) ?? [];
    return {
      id: layer.id,
      type: 'source',
      label: layer.name.trim() || prettifyId(layer.id),
      kinds: layerKinds,
      sources: [layer.id],
      swatch: model?.styles.find((style) => style.layerId === layer.id),
      count: sourceCount(layer.id, layerKinds, byKind),
      aggBelowZoom,
    };
  });
  const order = (a: LayerEntry, b: LayerEntry) =>
    (b.count ?? -1) - (a.count ?? -1) || a.label.localeCompare(b.label, 'en');
  return {
    kinds: entries.filter((entry) => entry.type === 'kind').sort(order),
    sources: entries.filter((entry) => entry.type === 'source').sort(order),
  };
}

/**
 * The style a kind layer's icon comes from: the style of a source that supplies the kind now, so
 * the rail and legend show what the map draws; else the first style for the kind.
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

/** The layers on by default: every kind layer that has records now. */
export function defaultEnabled(catalog: LayerCatalog): string[] {
  return catalog.kinds.filter((entry) => (entry.count ?? 0) > 0).map((entry) => entry.id);
}

/**
 * The kinds the enabled layers draw, and from which sources: a kind layer draws its kind from the
 * sources that supply it now, or from any source (`'*'`) when none does; a source layer draws its
 * kinds from itself. The legend shows only these.
 */
export function enabledKinds(
  catalog: LayerCatalog,
  enabled: ReadonlySet<string>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (kind: string, source: string) => {
    const set = out.get(kind) ?? new Set<string>();
    set.add(source);
    out.set(kind, set);
  };
  for (const entry of catalog.kinds) {
    if (!enabled.has(entry.id)) continue;
    if (entry.sources.length === 0) add(entry.id, '*');
    for (const source of entry.sources) add(entry.id, source);
  }
  for (const entry of catalog.sources) {
    if (enabled.has(entry.id)) for (const kind of entry.kinds) add(kind, entry.id);
  }
  return out;
}
