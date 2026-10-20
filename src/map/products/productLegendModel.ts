import type { ProductLegend } from './productApi';

/** A product legend drawn as a bar: a gradient, bands, or a list of categories. */
export type LegendBar =
  | {
      type: 'gradient';
      /** A CSS `linear-gradient` from the low value to the high one. */
      background: string;
      /** Labels along the bar, at a percentage of its width. */
      ticks: { at: number; label: string }[];
    }
  | { type: 'bands'; bands: { color: string; label: string }[] }
  | { type: 'categories'; items: { color: string; label: string }[] };

/** Most tick labels a gradient bar carries, so they do not run together. */
const MAX_TICKS = 6;

/**
 * Turns a product's JSON legend (`getProductLegend`) into a bar: a continuous legend is a gradient
 * with its stops placed by value and its ticks (or else a few stops) labeled; a discrete one is a
 * row of equal bands, one per stop; a categorical one is a list of colored labels. Returns
 * undefined for a legend with nothing to draw.
 */
export function legendBar(legend: ProductLegend): LegendBar | undefined {
  if (legend.type === 'categorical') {
    const items = (legend.categories ?? []).map((item) => ({
      color: item.color,
      label: item.label,
    }));
    return items.length ? { type: 'categories', items } : undefined;
  }
  const stops = [...(legend.stops ?? [])].sort((a, b) => a.value - b.value);
  if (stops.length === 0) return undefined;
  if (legend.type === 'discrete') {
    return {
      type: 'bands',
      bands: stops.map((stop) => ({ color: stop.color, label: stop.label ?? format(stop.value) })),
    };
  }
  const low = stops[0]!.value;
  const high = stops[stops.length - 1]!.value;
  const span = high - low || 1;
  const at = (value: number) => Math.round(((value - low) / span) * 1000) / 10;
  const background = `linear-gradient(to right, ${stops
    .map((stop) => `${stop.color} ${at(stop.value)}%`)
    .join(', ')})`;
  const source = legend.ticks?.length
    ? legend.ticks.map((tick) => ({ value: tick.value, label: tick.label }))
    : stops.map((stop) => ({ value: stop.value, label: stop.label ?? format(stop.value) }));
  const inRange = source.filter((tick) => tick.value >= low && tick.value <= high);
  const every = Math.ceil(inRange.length / MAX_TICKS);
  const ticks = inRange
    .filter((_, i) => i % every === 0)
    .map((tick) => ({ at: at(tick.value), label: tick.label }));
  return { type: 'gradient', background, ticks };
}

/** The plain-language meanings of a legend's ranges, one per line, for a tooltip. */
export function legendMeanings(legend: ProductLegend): string {
  return (legend.meaning ?? []).map((item) => item.text).join('\n');
}

/** A frame time as UTC, e.g. `Oct 20 14:30Z`. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${month} ${date.getUTCDate()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
}

/** A value as a short label. */
function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
