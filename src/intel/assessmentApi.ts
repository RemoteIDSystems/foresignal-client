import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** An ICD 203-structured assessment with its sections and key judgments (`Assessment`). */
export type Assessment = components['schemas']['Assessment'];

/** One section of an assessment, with its text origin (`Assessment.sections[]`). */
export type AssessmentSection = Assessment['sections'][number];

/** A typed, cited key judgment (`KeyJudgment`). */
export type KeyJudgment = components['schemas']['KeyJudgment'];

/** An assessment with its cited objects and their envelopes (`AssessmentBundle`). */
export type AssessmentBundle = components['schemas']['AssessmentBundle'];

/** One run of an on-demand situation assessment (`CycleRun`). */
export type CycleRun = components['schemas']['CycleRun'];

/** A versioned LLM prompt template (`PromptTemplate`). */
export type PromptTemplate = components['schemas']['PromptTemplate'];

/** A situation's on-demand assessments, newest first (`listSituationAssessments`). */
export async function listSituationAssessments(
  api: ForesignalClient,
  situationId: string,
  signal?: AbortSignal,
): Promise<Assessment[]> {
  const page = await unwrap(
    api.GET('/v1/situations/{situationId}/assessments', {
      params: { path: { situationId }, query: { limit: 20 } },
      signal,
    }),
  );
  return page.items;
}

/** One assessment in full, with its rendered sections (`getAssessment`). */
export function getAssessment(
  api: ForesignalClient,
  assessmentId: string,
  signal?: AbortSignal,
): Promise<Assessment> {
  return unwrap(
    api.GET('/v1/assessments/{assessmentId}', {
      params: { path: { assessmentId }, query: { format: 'json' } },
      signal,
    }),
  ) as Promise<Assessment>;
}

/** An assessment's cited objects with their envelopes and provenance (`getAssessmentBundle`). */
export function getAssessmentBundle(
  api: ForesignalClient,
  assessmentId: string,
  signal?: AbortSignal,
): Promise<AssessmentBundle> {
  return unwrap(
    api.GET('/v1/assessments/{assessmentId}/bundle', {
      params: { path: { assessmentId }, query: { format: 'json' } },
      signal,
    }),
  ) as Promise<AssessmentBundle>;
}

/** Starts an on-demand assessment of a situation (`createSituationAssessment`). */
export function createSituationAssessment(
  api: ForesignalClient,
  situationId: string,
): Promise<CycleRun> {
  return unwrap(
    api.POST('/v1/situations/{situationId}/assessment', {
      params: { path: { situationId } },
      body: {},
    }),
  );
}

/** One run's progress (`getCycleRun`). */
export function getCycleRun(
  api: ForesignalClient,
  runId: string,
  signal?: AbortSignal,
): Promise<CycleRun> {
  return unwrap(api.GET('/v1/analysis/runs/{runId}', { params: { path: { runId } }, signal }));
}

/** A prompt template at a version, as JSON (`getPromptTemplate`). */
export function getPromptTemplate(
  api: ForesignalClient,
  templateId: string,
  version: string,
  signal?: AbortSignal,
): Promise<PromptTemplate> {
  return unwrap(
    api.GET('/v1/prompt-templates/{templateId}', {
      params: { path: { templateId }, query: { version } },
      headers: { Accept: 'application/json' },
      signal,
    }),
  ) as Promise<PromptTemplate>;
}
