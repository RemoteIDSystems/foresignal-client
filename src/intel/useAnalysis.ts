import { useCallback, useEffect, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import type { ChangeStream } from '../api/stream/ChangeStream';
import { getObject, type ObjectEnvelope } from '../objects/objectApi';
import type { AnalysisKind } from './analysisView';
import { getInvestigation, type Investigation } from './investigationApi';
import {
  getSituation,
  getSituationChanges,
  getSituationTimeline,
  listSituationMembers,
  type Situation,
  type SituationChanges,
  type SituationMember,
  type SituationTimelineEntry,
} from './situationApi';

/** How often an open analysis is read again, in ms, besides after stream activity. */
export const ANALYSIS_REFRESH_MS = 60_000;

/** How long the live stream must be quiet after changes before the analysis is read again, in ms. */
export const ANALYSIS_SETTLE_MS = 5_000;

/** A situation's full analysis: the situation, its members, timeline and what changed. */
export interface SituationAnalysis {
  kind: 'situation';
  situation: Situation;
  members: SituationMember[];
  timeline: SituationTimelineEntry[];
  /** Undefined when the diff did not load; the rest still shows. */
  changes?: SituationChanges;
}

/** An investigation's workspace: the investigation and its envelope (what the caller may do). */
export interface InvestigationAnalysis {
  kind: 'investigation';
  investigation: Investigation;
  /** Undefined when the envelope did not load; editing is then not offered. */
  envelope?: ObjectEnvelope;
}

/** Either analysis. */
export type Analysis = SituationAnalysis | InvestigationAnalysis;

/** Where loading an analysis stands; a failed refresh keeps the last data and says why. */
export type AnalysisState =
  | { status: 'loading' }
  | { status: 'ready'; analysis: Analysis; loadedAt: string; error?: string }
  | { status: 'error'; error: unknown };

/** Reads one analysis: for a situation its four parts at once, for an investigation two. */
export async function loadAnalysis(
  api: ForesignalClient,
  kind: AnalysisKind,
  id: string,
  since: string,
  signal?: AbortSignal,
): Promise<Analysis> {
  if (kind === 'investigation') {
    const [investigation, envelope] = await Promise.all([
      getInvestigation(api, id, signal),
      getObject(api, `investigation:${id}`, undefined, signal).catch(() => undefined),
    ]);
    return { kind, investigation, envelope };
  }
  const [situation, members, timeline, changes] = await Promise.all([
    getSituation(api, id, signal),
    listSituationMembers(api, id, signal),
    getSituationTimeline(api, id, { from: since }, signal),
    getSituationChanges(api, id, since, signal).catch(() => undefined),
  ]);
  return { kind, situation, members, timeline, changes };
}

/**
 * Loads a situation's or investigation's analysis and keeps it current: read again
 * {@link ANALYSIS_SETTLE_MS} after the live stream (011) goes quiet following changes, every
 * {@link ANALYSIS_REFRESH_MS}, and on `refresh()` (after an edit). The timeline and the
 * what-changed diff start at `since`.
 */
export function useAnalysis(
  api: ForesignalClient | undefined,
  stream: ChangeStream | undefined,
  kind: AnalysisKind,
  id: string,
  since: string,
): { state: AnalysisState; refresh: () => void } {
  const [state, setState] = useState<AnalysisState>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((value) => value + 1), []);
  const [loadedKey, setLoadedKey] = useState('');
  const key = `${kind}/${id}/${since}`;
  if (loadedKey !== key) {
    // A different analysis or window starts from loading, not from the last one's data.
    setLoadedKey(key);
    setState({ status: 'loading' });
  }

  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    const read = () =>
      loadAnalysis(api, kind, id, since, controller.signal).then(
        (analysis) => {
          if (!controller.signal.aborted) {
            setState({ status: 'ready', analysis, loadedAt: new Date().toISOString() });
          }
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setState((current) =>
            current.status === 'ready'
              ? {
                  ...current,
                  error: error instanceof Error ? error.message : 'The refresh failed.',
                }
              : { status: 'error', error },
          );
        },
      );
    void read();
    const timer = setInterval(() => void read(), ANALYSIS_REFRESH_MS);
    let settle: ReturnType<typeof setTimeout> | undefined;
    const stop = stream?.listen({
      changes: () => {
        clearTimeout(settle);
        settle = setTimeout(() => void read(), ANALYSIS_SETTLE_MS);
      },
    });
    return () => {
      controller.abort();
      clearInterval(timer);
      clearTimeout(settle);
      stop?.();
    };
  }, [api, stream, kind, id, since, generation]);

  return { state, refresh };
}
