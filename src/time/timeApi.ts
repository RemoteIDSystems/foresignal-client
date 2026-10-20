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
 * The most kinds one `getTimeline` or `getHistoryFrames` request may name. The backend refuses more
 * ("at most 100 values are allowed"); the OpenAPI does not state the limit.
 */
export const MAX_KINDS_PER_REQUEST = 100;

/** The kinds split into request-sized chunks; one empty chunk when there are none. */
export function kindChunks(kinds: readonly string[]): string[][] {
  if (kinds.length === 0) return [[]];
  const chunks: string[][] = [];
  for (let i = 0; i < kinds.length; i += MAX_KINDS_PER_REQUEST) {
    chunks.push(kinds.slice(i, i + MAX_KINDS_PER_REQUEST));
  }
  return chunks;
}

/**
 * The scrubber's density histogram (`getTimeline`): how many record versions were observed in each
 * bucket of the window, for these kinds (all kinds when none) and, when given, this area. Its
 * `retainedFrom` is how far back history is kept, and `approximate` says the counts are estimates.
 * More kinds than one request may name are asked in chunks and summed ({@link mergeTimelines}).
 */
export async function loadTimeline(
  api: ForesignalClient,
  window: TimeWindow,
  kinds: readonly string[],
  bbox?: readonly number[],
  signal?: AbortSignal,
): Promise<Timeline> {
  const parts = await Promise.all(
    kindChunks(kinds).map((chunk) =>
      unwrap(
        api.GET('/v1/timeline', {
          params: {
            query: {
              from: wholeSecondIso(window.from),
              to: wholeSecondIso(window.to),
              ...(chunk.length > 0 && { kind: chunk }),
              ...(bbox && { bbox: bbox.join(',') }),
            },
          },
          signal,
        }),
      ),
    ),
  );
  return mergeTimelines(parts);
}

/**
 * Histograms for disjoint sets of kinds over one window, as one: each bucket's total and counts
 * summed by its time, the largest bucket recomputed, approximate when any part is, and history
 * retained from the latest of the parts' starts (what all of them still hold).
 */
export function mergeTimelines(parts: readonly Timeline[]): Timeline {
  const [first, ...rest] = parts;
  if (!first) throw new Error('mergeTimelines needs at least one histogram');
  if (rest.length === 0) return first;
  const buckets = new Map<string, Timeline['buckets'][number]>();
  for (const part of parts) {
    for (const bucket of part.buckets) {
      const into = buckets.get(bucket.t);
      if (!into) {
        buckets.set(bucket.t, {
          ...bucket,
          ...(bucket.counts && { counts: { ...bucket.counts } }),
        });
        continue;
      }
      into.total += bucket.total;
      for (const [key, count] of Object.entries(bucket.counts ?? {})) {
        into.counts = { ...into.counts, [key]: (into.counts?.[key] ?? 0) + count };
      }
    }
  }
  const merged = [...buckets.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const retained = parts.map((part) => part.retainedFrom).filter((at): at is string => !!at);
  const backends = new Set(parts.map((part) => part.backend));
  return {
    ...first,
    buckets: merged,
    maxBucket: merged.reduce((max, bucket) => Math.max(max, bucket.total), 0),
    approximate: parts.some((part) => part.approximate === true),
    retainedFrom:
      retained.length > 0
        ? retained.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest))
        : first.retainedFrom,
    ...(backends.size > 1 && { backend: 'mixed' as const }),
  };
}

/**
 * History for playback (`getHistoryFrames`): the keyframe at the window's start and the delta frames
 * after it, for these kinds in this area, each entity at its position. The step is chosen so the
 * window plays in about `PLAYBACK_FRAMES` frames ({@link frameStep}); the backend caps the
 * frames at 240. More kinds than one request may name are asked in chunks and joined
 * ({@link mergeHistoryFrames}).
 */
export async function loadHistoryFrames(
  api: ForesignalClient,
  window: TimeWindow,
  kinds: readonly string[],
  bbox?: readonly number[],
  signal?: AbortSignal,
): Promise<HistoryFrames> {
  const parts = await Promise.all(
    kindChunks(kinds).map(
      (chunk) =>
        unwrap(
          api.GET('/v1/history/frames', {
            params: {
              query: {
                kind: chunk,
                from: wholeSecondIso(window.from),
                to: wholeSecondIso(window.to),
                step: frameStep(window.to - window.from),
                ...(bbox && { bbox: bbox.join(',') }),
              },
            },
            signal,
          }),
        ) as Promise<HistoryFrames>,
    ),
  );
  return mergeHistoryFrames(parts);
}

/**
 * Playbacks for disjoint sets of kinds over one window, as one: the keyframes joined, and each
 * frame's upserts and removals joined by its time, in time order. Approximate when any part is;
 * the watermark and horizon are the earliest, which every part has reached.
 */
export function mergeHistoryFrames(parts: readonly HistoryFrames[]): HistoryFrames {
  const [first, ...rest] = parts;
  if (!first) throw new Error('mergeHistoryFrames needs at least one playback');
  if (rest.length === 0) return first;
  const frames = new Map<string, HistoryFrames['frames'][number]>();
  for (const part of parts) {
    for (const frame of part.frames) {
      const into = frames.get(frame.t);
      if (!into)
        frames.set(frame.t, {
          ...frame,
          upserts: [...frame.upserts],
          removals: [...frame.removals],
        });
      else {
        into.upserts.push(...frame.upserts);
        into.removals.push(...frame.removals);
      }
    }
  }
  const horizons = parts.map((part) => part.horizon).filter((at): at is string => !!at);
  return {
    ...first,
    keyframe: parts.flatMap((part) => part.keyframe),
    frames: [...frames.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t)),
    watermarkSeq: Math.min(...parts.map((part) => part.watermarkSeq)),
    approximate: parts.some((part) => part.approximate === true),
    ...(horizons.length > 0 && {
      horizon: horizons.reduce((earliest, at) =>
        Date.parse(at) < Date.parse(earliest) ? at : earliest,
      ),
    }),
  };
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
