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

/** How often the summary of an unchanged viewport is read again, in ms. */
export const SUMMARY_REFRESH_MS = 60_000;

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
 * Summarizes a viewport (`summarizeContext`) over the last {@link SUMMARY_WINDOW_MS} and reads
 * its per-layer counts: aggregates, never feature lists. A viewport across the antimeridian is
 * asked about in its two halves ({@link splitAtAntimeridian}) and the counts are added.
 */
export async function summarizeViewport(
  api: ForesignalClient,
  viewport: CommittedViewport,
  now: Date = new Date(),
  signal?: AbortSignal,
): Promise<ViewCounts> {
  const start = new Date(now.getTime() - SUMMARY_WINDOW_MS).toISOString();
  const summaries = await Promise.all(
    splitAtAntimeridian(viewport.bbox).map((bbox) =>
      unwrap(
        api.POST('/v1/context/summary', {
          body: { viewport: { bbox }, timeRange: { start } },
          signal,
        }),
      ),
    ),
  );
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    for (const { layer, count } of summary.layerCounts) {
      counts.set(layer, (counts.get(layer) ?? 0) + count);
    }
  }
  return { viewport, counts, generatedAt: summaries[0]?.generatedAt ?? now.toISOString() };
}

/**
 * The per-layer counts of the committed viewport, kept current: summarized
 * {@link SUMMARY_DEBOUNCE_MS} after the viewport settles, and again every
 * {@link SUMMARY_REFRESH_MS}. A request for an older viewport is canceled. Undefined until the
 * first summary arrives; a failed refresh keeps the last counts.
 */
export function useViewCounts(
  api: ForesignalClient | undefined,
  viewport: CommittedViewport | undefined,
): ViewCounts | undefined {
  const [counts, setCounts] = useState<ViewCounts>();
  useEffect(() => {
    if (!api || !viewport) return;
    let controller: AbortController | undefined;
    const load = () => {
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      summarizeViewport(api, viewport, new Date(), mine.signal).then(
        (next) => {
          if (!mine.signal.aborted) setCounts(next);
        },
        (error: unknown) => {
          if (!mine.signal.aborted)
            console.warn('ForeSignal: the view summary did not load.', error);
        },
      );
    };
    const first = setTimeout(load, SUMMARY_DEBOUNCE_MS);
    const refresh = setInterval(load, SUMMARY_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(refresh);
      controller?.abort();
    };
  }, [api, viewport]);
  return counts;
}
