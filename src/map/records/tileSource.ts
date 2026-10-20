import type { ForesignalClient } from '../../api/client';
import { decodeTile, type RecordFeature } from './decodeTile';
import type { GeoRect, TileId } from './tileMath';
import { parseTileTemplate, type RecordTileTemplate } from './tileTemplate';

/** A record layer's TileJSON, reduced to what drawing it needs. */
export interface LayerTiles {
  template: RecordTileTemplate;
  minzoom: number;
  maxzoom: number;
  /** The layer's bounds, when its TileJSON gives them. */
  bounds?: GeoRect;
  /** The backend's `foresignal:aggBelowZoom`: below it, `agg=auto` tiles hold aggregate cells. */
  aggBelowZoom?: number;
}

/**
 * What loading a layer's TileJSON gave: its tiles, or why it cannot be drawn. A `transient`
 * failure (the backend busy or rate limiting, 429/503, past the client's own retries) is worth
 * asking again shortly; any other is not.
 */
export type LayerTilesResult =
  { ok: true; tiles: LayerTiles } | { ok: false; message: string; transient?: boolean };

/**
 * Loads a record layer's TileJSON (`getTileJson`) and reads its concrete tile template, zoom
 * range, bounds and aggregation zoom. A TileJSON with no usable template (none, another shape, or
 * a time alias such as `latest`) cannot be drawn and gives a message. Retries on 429/503 are the
 * API client's (002).
 */
export async function loadLayerTiles(
  api: ForesignalClient,
  layer: string,
  signal?: AbortSignal,
): Promise<LayerTilesResult> {
  const { data, error, response } = await api.GET('/v1/tiles/{layer}.json', {
    params: { path: { layer } },
    signal,
  });
  if (!data) {
    return {
      ok: false,
      message: describeError(error, 'The layer’s TileJSON did not load.'),
      transient: TRANSIENT_STATUSES.has(response.status),
    };
  }
  const template = data.tiles?.map(parseTileTemplate).find(Boolean);
  if (!template) return { ok: false, message: 'The layer’s TileJSON has no record tile template.' };
  const [west, south, east, north] = data.bounds ?? [];
  const aggregation = data['foresignal:aggBelowZoom'];
  return {
    ok: true,
    tiles: {
      template,
      minzoom: data.minzoom ?? 0,
      maxzoom: data.maxzoom ?? 16,
      bounds:
        west !== undefined && south !== undefined && east !== undefined && north !== undefined
          ? { west, south, east, north }
          : undefined,
      aggBelowZoom: typeof aggregation === 'number' ? aggregation : undefined,
    },
  };
}

/**
 * What fetching one tile gave: its decoded records; `missing` when the layer is not on the server
 * (404), which no other tile will change; or `failed` for any other error, `transient` when the
 * backend was busy or rate limiting (429/503) and the tile is worth asking for again shortly.
 */
export type TileResult =
  | { status: 'ok'; features: RecordFeature[] }
  | { status: 'missing'; message: string }
  | { status: 'failed'; message: string; transient?: boolean };

/** Statuses after which a request is worth making again shortly: rate limited, or busy. */
const TRANSIENT_STATUSES = new Set([429, 503]);

/** What a tile is asked for as: `none` for records, `hex` for aggregate cells (008). */
export type TileAggregation = 'none' | 'hex';

/**
 * Fetches one record tile (`getTile`) with the template's query, as binary, and decodes it. The
 * request goes through the API client, so it carries the client's credentials and is retried on
 * 429/503 per `Retry-After` (002). An empty body (no records in the tile) decodes to no features.
 * `agg` says whether the tile holds records or hexagon counts; without it the template's own
 * `agg` (or the backend's `auto`) applies. Throws only when `signal` aborts.
 */
export async function fetchTile(
  api: ForesignalClient,
  template: RecordTileTemplate,
  tile: TileId,
  signal?: AbortSignal,
  agg?: TileAggregation,
): Promise<TileResult> {
  const query = agg ? { ...template.query, agg } : template.query;
  const { data, error, response } = await api.GET('/v1/tiles/{layer}/{z}/{x}/{y}.mvt', {
    params: { path: { layer: template.layer, ...tile }, query },
    parseAs: 'arrayBuffer',
    headers: { Accept: 'application/vnd.mapbox-vector-tile' },
    signal,
  });
  if (response.status === 404) {
    return { status: 'missing', message: describeError(error, 'The layer is not on the server.') };
  }
  if (!response.ok) {
    return {
      status: 'failed',
      message: describeError(error, `HTTP ${response.status}`),
      transient: TRANSIENT_STATUSES.has(response.status),
    };
  }
  return {
    status: 'ok',
    features: decodeTile((data as ArrayBuffer | undefined) ?? new ArrayBuffer(0), tile),
  };
}

/** A readable reason from an API error body (a problem's `detail`), else the fallback. */
function describeError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string') {
    return error.detail;
  }
  return fallback;
}
