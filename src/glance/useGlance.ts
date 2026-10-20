import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import type { ChangeStream } from '../api/stream/ChangeStream';
import {
  loadGrid,
  loadSeries,
  loadTop,
  readGlance,
  statsWindow,
  type GlanceRead,
  type StatsGrid,
  type StatsSeries,
  type StatsTop,
} from './glanceApi';

/** How often the status is read again (the backend caches it for 15 s). */
export const GLANCE_REFRESH_MS = 30_000;

/** How often the activity widgets are read again. */
export const STATS_REFRESH_MS = 5 * 60_000;

/** How long after a burst of stream activity the status and series are read again. */
export const ACTIVITY_SETTLE_MS = 5_000;

/** What the status widgets show; each part is absent until it first loads. */
export interface GlanceState {
  glance?: GlanceRead;
  series?: StatsSeries;
  topSources?: StatsTop;
  topKinds?: StatsTop;
  grid?: StatsGrid;
  /** Why the last read failed, if it did; the last data is kept. */
  error?: string;
}

/**
 * The backend's status and activity for the dashboard's small widgets (018): the status
 * (`getGlance`, revalidated by ETag) every {@link GLANCE_REFRESH_MS}; the last 24 hours' activity
 * series, top sources and kinds, and activity grid every {@link STATS_REFRESH_MS}. When the live
 * stream (011) delivers changes, the status and series are read again once it has been quiet for
 * {@link ACTIVITY_SETTLE_MS}, so the counts follow the activity without a request per change.
 */
export function useGlance(
  api: ForesignalClient | undefined,
  stream: ChangeStream | undefined,
): GlanceState {
  const [state, setState] = useState<GlanceState>({});
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    const { signal } = controller;
    let last: GlanceRead | undefined;
    const fail = (error: unknown) => {
      if (signal.aborted) return;
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'The status did not load.',
      }));
    };
    const status = () =>
      readGlance(api, last, signal).then((glance) => {
        if (signal.aborted) return;
        last = glance;
        setState((current) => ({ ...current, glance, error: undefined }));
      }, fail);
    const series = () =>
      loadSeries(api, statsWindow(new Date()), signal).then((loaded) => {
        if (!signal.aborted) setState((current) => ({ ...current, series: loaded }));
      }, fail);
    const stats = () => {
      const window = statsWindow(new Date());
      void series();
      Promise.all([
        loadTop(api, 'source', window, signal),
        loadTop(api, 'kind', window, signal),
        loadGrid(api, window, signal),
      ]).then(([topSources, topKinds, grid]) => {
        if (!signal.aborted) setState((current) => ({ ...current, topSources, topKinds, grid }));
      }, fail);
    };
    void status();
    stats();
    const statusTimer = setInterval(() => void status(), GLANCE_REFRESH_MS);
    const statsTimer = setInterval(stats, STATS_REFRESH_MS);
    let settle: ReturnType<typeof setTimeout> | undefined;
    const stop = stream?.listen({
      changes: () => {
        clearTimeout(settle);
        settle = setTimeout(() => {
          void status();
          void series();
        }, ACTIVITY_SETTLE_MS);
      },
    });
    return () => {
      controller.abort();
      clearInterval(statusTimer);
      clearInterval(statsTimer);
      clearTimeout(settle);
      stop?.();
    };
  }, [api, stream]);
  return state;
}
