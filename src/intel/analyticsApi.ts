import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** An analytic finding: evidence, inference with its base rate, and caveats (`AnalyticFinding`). */
export type AnalyticFinding = components['schemas']['AnalyticFinding'];

/** A projected impact with its probabilities and interval (`ProjectedImpact`). */
export type ProjectedImpact = components['schemas']['ProjectedImpact'];

/** A historical impact rate given a hazard class (`ImpactRate`). */
export type ImpactRate = components['schemas']['ImpactRate'];

/** A series the analysis detectors run on (`AnalysisSeries`). */
export type AnalysisSeries = components['schemas']['AnalysisSeries'];

/** A series' regular points and gaps over a period (`SeriesData`). */
export type SeriesData = components['schemas']['SeriesData'];

/** The most items one page of findings, impacts, rates or series may hold. */
export const ANALYTICS_PAGE_LIMIT = 500;

/** Filters for {@link listFindings}. */
export interface FindingQuery {
  /** Findings linked to this situation. */
  situationId?: string;
  /** Findings in any of these region codes. */
  region?: readonly string[];
  /** Only these statuses; open ones when absent. */
  status?: AnalyticFinding['status'][];
}

/** Findings newest first (`listFindings`), each with its base rate and caveats. */
export async function listFindings(
  api: ForesignalClient,
  query: FindingQuery = {},
  signal?: AbortSignal,
): Promise<AnalyticFinding[]> {
  const page = await unwrap(
    api.GET('/v1/analytics/findings', {
      params: {
        query: {
          limit: ANALYTICS_PAGE_LIMIT,
          status: query.status ?? ['open'],
          ...(query.situationId && { situationId: query.situationId }),
          ...(query.region && query.region.length > 0 && { region: [...query.region] }),
        },
      },
      signal,
    }),
  );
  return page.items;
}

/** One finding in full (`getFinding`). */
export function getFinding(
  api: ForesignalClient,
  id: string,
  signal?: AbortSignal,
): Promise<AnalyticFinding> {
  return unwrap(
    api.GET('/v1/analytics/findings/{findingId}', { params: { path: { findingId: id } }, signal }),
  );
}

/** Dismisses a finding with a reason (`updateFinding`, a JSON merge patch). */
export function dismissFinding(
  api: ForesignalClient,
  id: string,
  reason: string,
): Promise<AnalyticFinding> {
  return unwrap(
    api.PATCH('/v1/analytics/findings/{findingId}', {
      params: { path: { findingId: id } },
      body: { status: 'dismissed', reason },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    }),
  );
}

/**
 * Current projected impacts (`listProjectedImpacts`), highest probability first within each
 * hazard, in an admin-1 area or country when one is given.
 */
export async function listProjectedImpacts(
  api: ForesignalClient,
  query: { region?: string; since?: string } = {},
  signal?: AbortSignal,
): Promise<ProjectedImpact[]> {
  const page = await unwrap(
    api.GET('/v1/analytics/impacts', {
      params: {
        query: {
          limit: ANALYTICS_PAGE_LIMIT,
          ...(query.region && { region: query.region }),
          ...(query.since && { since: query.since }),
        },
      },
      signal,
    }),
  );
  return page.items;
}

/** Historical impact rates by hazard class, impact family and region class (`listImpactRates`). */
export async function listImpactRates(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<ImpactRate[]> {
  const page = await unwrap(
    api.GET('/v1/analytics/impact-rates', {
      params: { query: { limit: ANALYTICS_PAGE_LIMIT } },
      signal,
    }),
  );
  return page.items;
}

/** The enabled analysis series of these signal families and regions (`listAnalysisSeries`). */
export async function listAnalysisSeries(
  api: ForesignalClient,
  query: { family?: readonly string[]; region?: readonly string[] } = {},
  signal?: AbortSignal,
): Promise<AnalysisSeries[]> {
  const page = await unwrap(
    api.GET('/v1/analytics/series', {
      params: {
        query: {
          limit: ANALYTICS_PAGE_LIMIT,
          enabled: true,
          ...(query.family && query.family.length > 0 && { family: [...query.family] }),
          ...(query.region && query.region.length > 0 && { region: [...query.region] }),
        },
      },
      signal,
    }),
  );
  return page.items;
}

/** A series' points over a period (`getAnalyticsSeriesData`). */
export function getSeriesData(
  api: ForesignalClient,
  ref: string,
  window: { from: string; to: string },
  signal?: AbortSignal,
): Promise<SeriesData> {
  return unwrap(
    api.GET('/v1/analytics/series/data', {
      params: { query: { ref, from: window.from, to: window.to } },
      signal,
    }),
  );
}
