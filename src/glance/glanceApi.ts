import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import { toFsError } from '../api/errors';
import type { components } from '../api/generated/schema';

/** The backend's compact status (`Glance`). */
export type Glance = components['schemas']['Glance'];

/** A top-N ranking (`StatsTop`). */
export type StatsTop = components['schemas']['StatsTop'];

/** An activity time series (`StatsSeries`). */
export type StatsSeries = components['schemas']['StatsSeries'];

/** A spatial activity grid, as GeoJSON cells (`StatsGrid`). */
export type StatsGrid = components['schemas']['StatsGrid'];

/** The window the activity widgets cover: the last 24 hours. */
export const STATS_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The H3 resolution of the heat on the global-view inset: cells of a few hundred kilometers. */
export const GRID_RES = 2;

/** The status and the ETag it came with, so the next read can be answered 304. */
export interface GlanceRead {
  glance: Glance;
  etag?: string;
}

/**
 * The backend's compact status (`getGlance`), revalidated with the last read's ETag: a 304 hands
 * back the last status. Anonymous callers get the status, server time, latest alerts and last seq,
 * and no counts unless the server exposes them.
 */
export async function readGlance(
  api: ForesignalClient,
  last?: GlanceRead,
  signal?: AbortSignal,
): Promise<GlanceRead> {
  const { data, error, response } = await api.GET('/v1/glance', {
    params: { ...(last?.etag && { header: { 'If-None-Match': last.etag } }) },
    signal,
  });
  if (response.status === 304 && last) return last;
  if (!response.ok || !data) throw toFsError(response, error);
  return { glance: data as Glance, etag: response.headers.get('ETag') ?? undefined };
}

/** The widgets' window: from the start of the hour 24 hours ago to the current minute. */
export function statsWindow(now: Date): { from: string; to: string } {
  const from = new Date(now.getTime() - STATS_WINDOW_MS);
  from.setUTCMinutes(0, 0, 0);
  const to = new Date(now);
  to.setUTCSeconds(0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** The top sources or kinds by record versions over a window (`getStatsTop`). */
export function loadTop(
  api: ForesignalClient,
  by: 'source' | 'kind',
  window: { from: string; to: string },
  signal?: AbortSignal,
): Promise<StatsTop> {
  return unwrap(
    api.GET('/v1/stats/top', { params: { query: { by, limit: 3, ...window } }, signal }),
  );
}

/** Record versions per hour over a window (`getStatsTimeseries`), one series. */
export function loadSeries(
  api: ForesignalClient,
  window: { from: string; to: string },
  signal?: AbortSignal,
): Promise<StatsSeries> {
  return unwrap(
    api.GET('/v1/stats/timeseries', { params: { query: { bucket: '1h', ...window } }, signal }),
  );
}

/** Record versions per H3 cell over a window, worldwide (`getStatsGrid`). */
export function loadGrid(
  api: ForesignalClient,
  window: { from: string; to: string },
  signal?: AbortSignal,
): Promise<StatsGrid> {
  return unwrap(
    api.GET('/v1/stats/grid', {
      params: { query: { bbox: '-180,-85,180,85', res: GRID_RES, ...window } },
      signal,
    }),
  );
}

/** The points of a one-series answer (none when the window had no activity). */
export function seriesPoints(series: StatsSeries | undefined): { t: string; value: number }[] {
  return series?.series[0]?.points ?? [];
}

/** The total of a series' points. */
export function seriesTotal(series: StatsSeries | undefined): number {
  return seriesPoints(series).reduce((sum, point) => sum + point.value, 0);
}
