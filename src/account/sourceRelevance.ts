import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/** The request to rate a candidate source set (`analyzeTriggerSources`): 2–50 unique source ids. */
export type SourceRelevanceRequest = components['schemas']['SourceRelevanceRequest'];

/** The advisory relevance verdicts returned; nothing is changed by the call. */
export type SourceRelevanceAnalysis = components['schemas']['SourceRelevanceAnalysis'];

/** One source's advisory verdict within an analysis. */
export type SourceRelevance = components['schemas']['SourceRelevance'];

/** The verdict a source may receive. */
export type RelevanceVerdict = SourceRelevance['verdict'];

/**
 * Runs the advisory source-relevance analysis over a candidate set (`POST
 * /v1/triggers/analyze-sources`, gated `self.alerts`). The result is suggestions only — the caller
 * decides which sources to keep enabled.
 */
export function analyzeTriggerSources(
  api: ForesignalClient,
  sourceIds: string[],
): Promise<SourceRelevanceAnalysis> {
  return unwrap(api.POST('/v1/triggers/analyze-sources', { body: { sourceIds } }));
}
