import type { components } from '../api/generated/schema';
import type { ChartSeries } from '../ui/charts/chartOptions';
import type { CommittedViewport } from '../state/viewport';
import type {
  Place,
  PlaceInput,
  PlaceWeather,
  SavedView,
  SavedViewInput,
  WatchlistItemInput,
} from './savedApi';

/** A box `[west, south, east, north]` in degrees. */
export type Bbox = CommittedViewport['bbox'];

/** Where the map goes for a saved thing: a point and a camera height in meters. */
export interface FlyTo {
  longitude: number;
  latitude: number;
  height: number;
}

/** The longest slug or place id the backend takes. */
const SLUG_MAX = 64;

/**
 * A slug for a name (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters), made unique against
 * `taken` with a `-2`, `-3`, … suffix; `fallback` when the name has no letters or digits.
 */
export function slugOf(name: string, taken: ReadonlySet<string>, fallback = 'view'): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX)
      .replace(/-+$/, '') || fallback;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** What the Global map shows now, to save as a view. */
export interface MapLayers {
  /** The kinds drawn. */
  kinds: readonly string[];
  /** Sources hidden in the FILTERS tab. */
  hiddenSources: ReadonlySet<string>;
  /** Each drawn kind's sources, from the layer catalog. */
  sourcesOf: (kind: string) => readonly string[];
  /** The committed map view, when there is one. */
  bbox?: Bbox;
}

/**
 * The saved view for the map's layer and filter set: its kinds, the map's view as its box, and,
 * when sources are hidden, the drawn kinds' other sources (a view lists the sources it takes, not
 * the ones it leaves out). The backend compiles and evaluates it.
 */
export function viewFromMap(name: string, layers: MapLayers, slug: string): SavedViewInput {
  const kinds = [...layers.kinds].sort();
  const view: SavedViewInput = {
    slug,
    name: name.trim(),
    kinds,
    // The backend's defaults: the effective time, current records only.
    timeField: 'effective',
    includeExpired: false,
  };
  if (layers.hiddenSources.size > 0) {
    const sources = new Set(kinds.flatMap((kind) => [...layers.sourcesOf(kind)]));
    for (const hidden of layers.hiddenSources) sources.delete(hidden);
    view.sources = [...sources].sort();
  }
  if (layers.bbox) view.bbox = [...layers.bbox];
  return view;
}

/** The camera height that shows a box: its larger side, with a margin, within bounds. */
export function heightForBox([west, south, east, north]: Bbox): number {
  const width = east >= west ? east - west : east + 360 - west;
  const latitude = (south + north) / 2;
  const meters = Math.max(north - south, width * Math.cos((latitude * Math.PI) / 180)) * 111_000;
  return Math.round(Math.min(8_000_000, Math.max(1_000, meters * 1.2)));
}

/** Where to fly for a box: its middle (across the antimeridian too). */
export function flyToBox(bbox: Bbox): FlyTo {
  const [west, south, east, north] = bbox;
  const width = east >= west ? east - west : east + 360 - west;
  let longitude = west + width / 2;
  if (longitude > 180) longitude -= 360;
  return { longitude, latitude: (south + north) / 2, height: heightForBox(bbox) };
}

/** Where to fly for a saved view: its box, or nowhere when it has none. */
export function flyToView(view: SavedView): FlyTo | undefined {
  const bbox = view.bbox;
  return bbox && bbox.length === 4 ? flyToBox(bbox as unknown as Bbox) : undefined;
}

/** Every `[longitude, latitude]` pair in a geometry's coordinates. */
function positions(coordinates: unknown): [number, number][] {
  if (!Array.isArray(coordinates)) return [];
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number')
    return [[coordinates[0], coordinates[1]]];
  return coordinates.flatMap(positions);
}

/** The box around a geometry, or undefined when it has no positions. */
export function geometryBox(
  geometry: components['schemas']['Geometry'] | null | undefined,
): Bbox | undefined {
  const points = positions(geometry?.coordinates);
  if (!points.length) return undefined;
  const longitudes = points.map((point) => point[0]);
  const latitudes = points.map((point) => point[1]);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

/**
 * Where to fly for a place: a point place's point, seen from about four times its radius; any
 * other place's box (its derived area, else its geometry).
 */
export function flyToPlace(place: Place): FlyTo | undefined {
  if (place.shape === 'point') {
    const [point] = positions(place.geometry?.coordinates);
    if (!point) return undefined;
    const radius = place.radiusKm ?? 20;
    return {
      longitude: point[0],
      latitude: point[1],
      height: Math.round(Math.min(8_000_000, Math.max(5_000, radius * 4_000))),
    };
  }
  const box =
    geometryBox(place.area as components['schemas']['Geometry'] | undefined) ??
    geometryBox(place.geometry);
  return box && flyToBox(box);
}

/** A point place for a name, a position and a radius. */
export function pointPlace(
  name: string,
  longitude: number,
  latitude: number,
  radiusKm: number,
  taken: ReadonlySet<string>,
): PlaceInput {
  return {
    id: slugOf(name, taken, 'place'),
    name: name.trim(),
    shape: 'point',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    radiusKm,
    kind: 'user',
    sensitive: true,
  };
}

/**
 * Watchlist items from text: one per line, `value` or `value, label`. Blank lines are skipped;
 * the backend normalizes each value for the list's identity and says which are invalid.
 */
export function parseItems(text: string): WatchlistItemInput[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const comma = line.indexOf(',');
      if (comma < 0) return { value: line };
      const value = line.slice(0, comma).trim();
      const label = line.slice(comma + 1).trim();
      return label ? { value, label } : { value };
    })
    .filter((item) => item.value);
}

/** One row of a place's weather: a section, its status and what it says. */
export interface WeatherRow {
  section: string;
  status: string;
  text: string;
}

/** A number with its unit, or nothing when there is none. */
const measured = (value: number | undefined, unit: string) =>
  value === undefined ? undefined : `${value} ${unit}`;

/**
 * The sections of a place's weather as the backend reports them: each section's status as is
 * (`ok`, `stale`, `no-coverage`, `unavailable`), its own status text, or its main value.
 */
export function weatherRows(weather: PlaceWeather['weather']): WeatherRow[] {
  if (!weather) return [];
  const rows: WeatherRow[] = [];
  const add = (
    section: string,
    part: { status: string; statusText?: string } | undefined,
    value: string | undefined,
  ) => {
    if (part) rows.push({ section, status: part.status, text: part.statusText ?? value ?? '—' });
  };
  add('Radar', weather.radar, measured(weather.radar?.maxDbzInRadius, 'dBZ max'));
  add('Hail', weather.hail, measured(weather.hail?.meshMaxMmInRadius, 'mm max'));
  add('Precipitation', weather.precip, measured(weather.precip?.rateMmH, 'mm/h'));
  add('Lightning', weather.lightning, measured(weather.lightning?.nearestKm15m, 'km nearest'));
  add('Storm cell', weather.cell, measured(weather.cell?.eta50Min, 'min to arrival'));
  add('Smoke', weather.smoke, measured(weather.smoke?.hrrrPm25Max24h, 'µg/m³ max'));
  return rows;
}

/** The forecast temperatures, one line per provider, for the place weather chart. */
export function temperatureSeries(response: PlaceWeather): ChartSeries[] {
  return response.forecastSeries
    .map((series) => ({
      name: series.provider.toUpperCase(),
      points: series.items
        .filter((point) => point.tempC !== undefined && point.tempC !== null)
        .map((point) => [Date.parse(point.time), point.tempC ?? null] as [number, number | null]),
    }))
    .filter((series) => series.points.length > 0);
}

/** The slug of a watchlist's own saved view, which tracks its entities' current state. */
export function watchlistViewSlug(watchlistId: string): string {
  return `watchlist-${watchlistId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`.slice(0, 64);
}

/**
 * A watchlist's own saved view: every current record whose identity is on the list (an
 * `inWatchlist` condition without a path, so each source's declared identity field is used).
 */
export function watchlistView(list: { id: string; name: string }): SavedViewInput {
  return {
    slug: watchlistViewSlug(list.id),
    name: `Watchlist: ${list.name}`,
    conditions: [{ op: 'inWatchlist', value: list.id }],
    timeField: 'effective',
    includeExpired: false,
  };
}
