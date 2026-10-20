import { useEffect, useState } from 'react';
import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';
import { splitAtAntimeridian, type CommittedViewport } from './viewport';

/** A `summarizeContext` response. */
export type ContextSummary = components['schemas']['ContextSummary'];

/** The window a summary covers: the last 24 hours, as the Global mock's time bar starts at −24h. */
export const SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How long a new viewport must hold before it is summarized, in ms. */
export const SUMMARY_DEBOUNCE_MS = 400;

/**
 * How long the backend keeps a context's summary, in seconds (`summarizeContext` caches each
 * context for 30 s). A summary is not asked for again before its copy expires.
 */
export const SUMMARY_CACHE_S = 30;

/** The longest a summary of an unchanged viewport goes unread, in ms. */
export const SUMMARY_REFRESH_MS = 60_000;

/** One item of the merged activity feed (alerts, findings, situation changes, records). */
export type ActivityItem = ContextSummary['activity'][number];

/** One insight: a finding, an open forecast question, or a hypothesis band change. */
export type InsightItem = ContextSummary['insights'][number];

/** What the map's viewport holds now: records per layer (kind), aggregated by the backend. */
export interface ViewCounts {
  /** The viewport these counts are for. */
  viewport: CommittedViewport;
  /** Records in view per layer; a layer the backend does not list has none. */
  counts: ReadonlyMap<string, number>;
  /** When the backend made the summary. */
  generatedAt: string;
}

/**
 * A viewport's whole summary: its counts, the merged activity feed (newest first), the insights
 * and the related objects, with how old the backend's cached copy was.
 */
export interface ViewSummary extends ViewCounts {
  activity: ActivityItem[];
  insights: InsightItem[];
  related: ContextSummary['related'];
  /** Seconds the backend's copy had been cached when it answered. */
  cacheAgeSeconds: number;
  /** The instant the summary was asked as of, when the map is pinned (013). */
  asOf?: string;
  /** True when the backend cut a part short to stay within its size. */
  truncated: boolean;
}

/**
 * Summarizes a viewport (`summarizeContext`) over the {@link SUMMARY_WINDOW_MS} before now, or with
 * `asOf` before that instant and as known then. A viewport across the antimeridian is asked about
 * in its two halves ({@link splitAtAntimeridian}): their counts are added, and their activity,
 * insights and related objects merged once each, the activity newest first.
 */
export async function summarizeViewport(
  api: ForesignalClient,
  viewport: CommittedViewport,
  now: Date = new Date(),
  signal?: AbortSignal,
  asOf?: string,
): Promise<ViewSummary> {
  const end = asOf !== undefined ? new Date(asOf) : now;
  const start = new Date(end.getTime() - SUMMARY_WINDOW_MS).toISOString();
  const timeRange = asOf !== undefined ? { start, end: asOf } : { start };
  const summaries = await Promise.all(
    splitAtAntimeridian(viewport.bbox).map((bbox) =>
      unwrap(
        api.POST('/v1/context/summary', {
          body: { viewport: { bbox }, timeRange, ...(asOf !== undefined && { asOf }) },
          signal,
        }),
      ),
    ),
  );
  const counts = new Map<string, number>();
  const activity = new Map<string, ActivityItem>();
  const insights = new Map<string, InsightItem>();
  const related = new Map<string, ContextSummary['related'][number]>();
  for (const summary of summaries) {
    for (const { layer, count } of summary.layerCounts) {
      counts.set(layer, (counts.get(layer) ?? 0) + count);
    }
    for (const item of summary.activity) activity.set(`${item.ref}|${item.at}`, item);
    for (const item of summary.insights) insights.set(`${item.kind}|${item.ref}`, item);
    for (const item of summary.related) related.set(item.ref, item);
  }
  return {
    viewport,
    counts,
    generatedAt: summaries[0]?.generatedAt ?? now.toISOString(),
    activity: [...activity.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    insights: [...insights.values()],
    related: [...related.values()],
    cacheAgeSeconds: Math.max(0, ...summaries.map((summary) => summary.cacheAgeSeconds ?? 0)),
    ...(asOf !== undefined && { asOf }),
    truncated: summaries.some((summary) => summary.truncated === true),
  };
}

/** The state of the view's summary: the last one in, and why the latest read failed, if it did. */
export interface ViewSummaryState {
  summary?: ViewSummary;
  error?: string;
}

/**
 * The committed viewport's summary, kept current: read {@link SUMMARY_DEBOUNCE_MS} after the
 * viewport (or the time machine's instant) settles, then again once the backend's cached copy has
 * expired ({@link SUMMARY_CACHE_S} after it was made), and at least every
 * {@link SUMMARY_REFRESH_MS}. A request for an older viewport is canceled. A failed read keeps
 * the last summary and says why.
 */
export function useContextSummary(
  api: ForesignalClient | undefined,
  viewport: CommittedViewport | undefined,
  asOf?: string,
): ViewSummaryState {
  const [state, setState] = useState<ViewSummaryState>({});
  useEffect(() => {
    if (!api || !viewport) return;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      summarizeViewport(api, viewport, new Date(), mine.signal, asOf).then(
        (summary) => {
          if (mine.signal.aborted) return;
          setState({ summary });
          // The backend's copy is fresh for the rest of its 30 s; asked again once it expires.
          const fresh = Math.max(0, SUMMARY_CACHE_S - summary.cacheAgeSeconds) * 1_000;
          timer = setTimeout(load, Math.min(SUMMARY_REFRESH_MS, Math.max(fresh + 1_000, 30_000)));
        },
        (error: unknown) => {
          if (mine.signal.aborted) return;
          console.warn('ForeSignal: the view summary did not load.', error);
          setState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : 'The view summary did not load.',
          }));
          timer = setTimeout(load, SUMMARY_REFRESH_MS);
        },
      );
    };
    timer = setTimeout(load, SUMMARY_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller?.abort();
    };
  }, [api, viewport, asOf]);
  return state;
}
