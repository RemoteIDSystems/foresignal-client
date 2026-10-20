import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** A hypothesis set: one key question and its competing answers (`HypothesisSet`). */
export type HypothesisSet = components['schemas']['HypothesisSet'];

/** One competing answer, with its probability, term, confidence and change (`Hypothesis`). */
export type Hypothesis = components['schemas']['Hypothesis'];

/** An observable signal with likelihood ratios per hypothesis (`Indicator`). */
export type Indicator = components['schemas']['Indicator'];

/** The ACH audit view: evidence × hypotheses with inconsistency scores (`AchMatrix`). */
export type AchMatrix = components['schemas']['AchMatrix'];

/** One ACH evidence row with its ratings per hypothesis (`AchEvidence`). */
export type AchEvidence = components['schemas']['AchEvidence'];

/** An ACH consistency rating: CC, C, N, NA, I or II. */
export type AchRating = AchEvidence['ratings'][string];

/** Pending indicators ranked by expected information gain (`InformationValue`). */
export type InformationValue = components['schemas']['InformationValue'];

/** A hypothesis to add to a set (`HypothesisInput`). */
export type HypothesisInput = components['schemas']['HypothesisInput'];

/** The most sets or indicators one page holds. */
export const HYPOTHESIS_PAGE_LIMIT = 500;

/** The hypothesis sets linked to a situation, or every visible one (`listHypothesisSets`). */
export async function listHypothesisSets(
  api: ForesignalClient,
  query: { situationId?: string; status?: HypothesisSet['status'] } = {},
  signal?: AbortSignal,
): Promise<HypothesisSet[]> {
  const page = await unwrap(
    api.GET('/v1/hypotheses/sets', {
      params: {
        query: {
          limit: HYPOTHESIS_PAGE_LIMIT,
          ...(query.situationId && { situationId: query.situationId }),
          ...(query.status && { status: query.status }),
        },
      },
      signal,
    }),
  );
  return page.items;
}

/** One set in full, with its indicators and key assumptions (`getHypothesisSet`). */
export function getHypothesisSet(
  api: ForesignalClient,
  setId: string,
  signal?: AbortSignal,
): Promise<HypothesisSet> {
  return unwrap(api.GET('/v1/hypotheses/sets/{setId}', { params: { path: { setId } }, signal }));
}

/** A set's ACH matrix (`getAchMatrix`). */
export function getAchMatrix(
  api: ForesignalClient,
  setId: string,
  signal?: AbortSignal,
): Promise<AchMatrix> {
  return unwrap(
    api.GET('/v1/hypotheses/sets/{setId}/matrix', { params: { path: { setId } }, signal }),
  );
}

/** A set's pending indicators ranked by expected information gain (`getInformationValue`). */
export function getInformationValue(
  api: ForesignalClient,
  setId: string,
  signal?: AbortSignal,
): Promise<InformationValue> {
  return unwrap(
    api.GET('/v1/hypotheses/sets/{setId}/information-value', {
      params: { path: { setId } },
      signal,
    }),
  );
}

/** Indicators of a set, or in a state (`listIndicators`). */
export async function listIndicators(
  api: ForesignalClient,
  query: { setId?: string; state?: Indicator['state'] } = {},
  signal?: AbortSignal,
): Promise<Indicator[]> {
  const page = await unwrap(
    api.GET('/v1/indicators', {
      params: {
        query: {
          limit: HYPOTHESIS_PAGE_LIMIT,
          ...(query.setId && { setId: query.setId }),
          ...(query.state && { state: query.state }),
        },
      },
      signal,
    }),
  );
  return page.items;
}

/** Adds a competing hypothesis to a set (`addHypothesis`); an exclusive set is renormalized. */
export function addHypothesis(
  api: ForesignalClient,
  setId: string,
  input: HypothesisInput,
): Promise<Hypothesis> {
  return unwrap(
    api.POST('/v1/hypotheses/sets/{setId}/hypotheses', {
      params: { path: { setId } },
      body: input,
    }),
  );
}
