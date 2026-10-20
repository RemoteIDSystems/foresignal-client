import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** A ledger question with its ensemble and latest forecasts (`ForecastQuestion`). */
export type ForecastQuestion = components['schemas']['ForecastQuestion'];

/** A question as lists carry it: its ensemble probability and term, not its forecasts. */
export type QuestionSummary = components['schemas']['ForecastQuestionSummary'];

/** One forecaster's forecast on a question (`Forecast`). */
export type Forecast = components['schemas']['Forecast'];

/** Each forecaster's standing forecast per day (`ForecastHistory`). */
export type ForecastHistory = components['schemas']['ForecastHistory'];

/** Scores, calibration, skill and bias per forecaster and category (`ForecastScorecard`). */
export type ForecastScorecard = components['schemas']['ForecastScorecard'];

/** One scorecard row (`ScorecardEntry`). */
export type ScorecardEntry = components['schemas']['ScorecardEntry'];

/** Reliability bins and the recalibrated curve (`ForecastCalibration`). */
export type ForecastCalibration = components['schemas']['ForecastCalibration'];

/** The most questions or forecasts one page holds. */
export const FORECAST_PAGE_LIMIT = 500;

/** Filters for {@link listForecastQuestions}. */
export interface QuestionQuery {
  /** Questions linked to this object ref, e.g. `situation:01J…`. */
  linked?: string;
  /** Only these statuses; open ones when absent. */
  status?: QuestionSummary['status'][];
  /** Questions that resolve before this instant. */
  dueBefore?: string;
}

/** Ledger questions (`listForecastQuestions`), open ones by default. */
export async function listForecastQuestions(
  api: ForesignalClient,
  query: QuestionQuery = {},
  signal?: AbortSignal,
): Promise<QuestionSummary[]> {
  const page = await unwrap(
    api.GET('/v1/forecasts/questions', {
      params: {
        query: {
          limit: FORECAST_PAGE_LIMIT,
          status: query.status ?? ['open'],
          ...(query.linked && { linked: query.linked }),
          ...(query.dueBefore && { dueBefore: query.dueBefore }),
        },
      },
      signal,
    }),
  );
  return page.items;
}

/** One question in full (`getForecastQuestion`). */
export function getForecastQuestion(
  api: ForesignalClient,
  questionId: string,
  signal?: AbortSignal,
): Promise<ForecastQuestion> {
  return unwrap(
    api.GET('/v1/forecasts/questions/{questionId}', {
      params: { path: { questionId } },
      signal,
    }),
  );
}

/** A question's standing forecasts per day, by forecaster (`getForecastQuestionHistory`). */
export function getForecastQuestionHistory(
  api: ForesignalClient,
  questionId: string,
  signal?: AbortSignal,
): Promise<ForecastHistory> {
  return unwrap(
    api.GET('/v1/forecasts/questions/{questionId}/history', {
      params: { path: { questionId } },
      signal,
    }),
  );
}

/** Every forecast on a question, per forecaster (`listForecasts`). */
export async function listForecasts(
  api: ForesignalClient,
  questionId: string,
  signal?: AbortSignal,
): Promise<Forecast[]> {
  const page = await unwrap(
    api.GET('/v1/forecasts/questions/{questionId}/forecasts', {
      params: { path: { questionId }, query: { limit: FORECAST_PAGE_LIMIT } },
      signal,
    }),
  );
  return page.items;
}

/** The ledger's scorecard, for every forecaster and category (`getForecastScorecard`). */
export function getForecastScorecard(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<ForecastScorecard> {
  return unwrap(api.GET('/v1/forecasts/scorecard', { signal }));
}

/** The ledger's calibration across forecasters and categories (`getForecastCalibration`). */
export function getForecastCalibration(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<ForecastCalibration> {
  return unwrap(api.GET('/v1/forecasts/calibration', { signal }));
}
