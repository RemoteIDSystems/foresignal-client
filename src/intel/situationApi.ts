import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** A situation in a list (`SituationSummary`). */
export type SituationSummary = components['schemas']['SituationSummary'];

/** A situation with its evidence, inference and speculation (`Situation`). */
export type Situation = components['schemas']['Situation'];

/** A pinned member of a situation (`SituationMember`). */
export type SituationMember = components['schemas']['SituationMember'];

/** One entry of a situation's timeline: a member observation or a log entry. */
export type SituationTimelineEntry = components['schemas']['SituationTimelineEntry'];

/** What changed in a situation since a day (`SituationChanges`). */
export type SituationChanges = components['schemas']['SituationChanges'];

/** The most items one page of situations, members or timeline entries may hold. */
export const SITUATION_PAGE_LIMIT = 500;

/** Filters for {@link listSituations}. */
export interface SituationQuery {
  /** Case-insensitive text match on the title and summary. */
  q?: string;
  /** Only these statuses. */
  status?: SituationSummary['status'][];
  /** Only situations within this area (minLon, minLat, maxLon, maxLat). */
  bbox?: readonly number[];
}

/** Situations by latest activity (`listSituations`), at most one page of 500. */
export async function listSituations(
  api: ForesignalClient,
  query: SituationQuery = {},
  signal?: AbortSignal,
): Promise<SituationSummary[]> {
  const page = await unwrap(
    api.GET('/v1/situations', {
      params: {
        query: {
          limit: SITUATION_PAGE_LIMIT,
          ...(query.q && { q: query.q }),
          ...(query.status && query.status.length > 0 && { status: query.status }),
          ...(query.bbox && { bbox: query.bbox.join(',') }),
        },
      },
      signal,
    }),
  );
  return page.items;
}

/** A situation with its members grouped by signal family (`getSituation`). */
export function getSituation(
  api: ForesignalClient,
  id: string,
  signal?: AbortSignal,
): Promise<Situation> {
  return unwrap(
    api.GET('/v1/situations/{situationId}', { params: { path: { situationId: id } }, signal }),
  );
}

/** A situation's pinned members, most recently observed first (`listSituationMembers`). */
export async function listSituationMembers(
  api: ForesignalClient,
  id: string,
  signal?: AbortSignal,
): Promise<SituationMember[]> {
  const page = await unwrap(
    api.GET('/v1/situations/{situationId}/members', {
      params: { path: { situationId: id }, query: { limit: SITUATION_PAGE_LIMIT } },
      signal,
    }),
  );
  return page.items;
}

/**
 * A situation's members and log entries merged in time order (`getSituationTimeline`), over a
 * window when one is given, at most one page of 500.
 */
export async function getSituationTimeline(
  api: ForesignalClient,
  id: string,
  window: { from?: string; to?: string } = {},
  signal?: AbortSignal,
): Promise<SituationTimelineEntry[]> {
  const page = await unwrap(
    api.GET('/v1/situations/{situationId}/timeline', {
      params: {
        path: { situationId: id },
        query: {
          limit: SITUATION_PAGE_LIMIT,
          ...(window.from && { from: window.from }),
          ...(window.to && { to: window.to }),
        },
      },
      signal,
    }),
  );
  return page.items;
}

/**
 * What changed since `since` (`getSituationChanges`): the diff of the daily snapshot of that UTC
 * day and now, answered without a language model.
 */
export function getSituationChanges(
  api: ForesignalClient,
  id: string,
  since: string,
  signal?: AbortSignal,
): Promise<SituationChanges> {
  return unwrap(
    api.GET('/v1/situations/{situationId}/changes', {
      params: { path: { situationId: id }, query: { since } },
      signal,
    }),
  );
}
