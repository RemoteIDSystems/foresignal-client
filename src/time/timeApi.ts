import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';
import type { HistoryFrames } from './history';
import { frameStep, wholeSecondIso } from './scrub';

/** The scrubber's density histogram (`Timeline`). */
export type Timeline = components['schemas']['Timeline'];

/** An entity's simplified trail (`Track`). */
export type Track = components['schemas']['Track'];

/** A time window, in epoch ms. */
export interface TimeWindow {
  from: number;
  to: number;
}

/**
 * The scrubber's density histogram (`getTimeline`): how many record versions were observed in each
 * bucket of the window, for these kinds (all kinds when none) and, when given, this area. Its
 * `retainedFrom` is how far back history is kept, and `approximate` says the counts are estimates.
 */
export function loadTimeline(
  api: ForesignalClient,
  window: TimeWindow,
  kinds: readonly string[],
  bbox?: readonly number[],
  signal?: AbortSignal,
): Promise<Timeline> {
  return unwrap(
    api.GET('/v1/timeline', {
      params: {
        query: {
          from: wholeSecondIso(window.from),
          to: wholeSecondIso(window.to),
          ...(kinds.length > 0 && { kind: [...kinds] }),
          ...(bbox && { bbox: bbox.join(',') }),
        },
      },
      signal,
    }),
  );
}

/**
 * History for playback (`getHistoryFrames`): the keyframe at the window's start and the delta frames
 * after it, for these kinds in this area, each entity at its position. The step is chosen so the
 * window plays in about `PLAYBACK_FRAMES` frames ({@link frameStep}); the backend caps the
 * frames at 240.
 */
export function loadHistoryFrames(
  api: ForesignalClient,
  window: TimeWindow,
  kinds: readonly string[],
  bbox?: readonly number[],
  signal?: AbortSignal,
): Promise<HistoryFrames> {
  return unwrap(
    api.GET('/v1/history/frames', {
      params: {
        query: {
          kind: [...kinds],
          from: wholeSecondIso(window.from),
          to: wholeSecondIso(window.to),
          step: frameStep(window.to - window.from),
          ...(bbox && { bbox: bbox.join(',') }),
        },
      },
      signal,
    }),
  ) as Promise<HistoryFrames>;
}

/**
 * An entity's trail over a window (`getRecordTrack`): a simplified multi-line of where it was,
 * split at gaps, with its current live position appended while the window reaches now. A
 * stationary record's trail is its one point repeated.
 */
export function loadTrack(
  api: ForesignalClient,
  sourceId: string,
  externalId: string,
  window: TimeWindow,
  signal?: AbortSignal,
): Promise<Track> {
  return unwrap(
    api.GET('/v1/records/{sourceId}/{externalId}/track', {
      params: {
        path: { sourceId, externalId },
        query: { from: wholeSecondIso(window.from), to: wholeSecondIso(window.to) },
      },
      signal,
    }),
  ) as Promise<Track>;
}
