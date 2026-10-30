import type { BadgeTone } from '../ui/Badge';
import type { ChartSeries, ReliabilityBin } from '../ui/charts/chartOptions';
import { prettifyId } from '../lib/labels';
import type {
  Forecast,
  ForecastHistory,
  ForecastQuestion,
  QuestionSummary,
  ScorecardEntry,
} from './forecastApi';
import type { Analysis } from './useAnalysis';

/** The most questions an investigation's links are read for, one request each. */
export const LINKED_QUESTIONS = 20;

/** The horizon selector, as the mock's 1 month / 3 months / 6 months / 1 year. */
export const HORIZONS = [
  { key: '1', label: '1 month', months: 1 },
  { key: '3', label: '3 months', months: 3 },
  { key: '6', label: '6 months', months: 6 },
  { key: '12', label: '1 year', months: 12 },
] as const;

/** One horizon. */
export type Horizon = (typeof HORIZONS)[number];

/** The horizon the panel opens on, as the mock: 3 months. */
export const DEFAULT_HORIZON: Horizon = HORIZONS[1];

/** The instant a horizon ends: `months` calendar months after `now`, in UTC. */
export function horizonEnd(months: number, now: number): string {
  const at = new Date(now);
  at.setUTCMonth(at.getUTCMonth() + months);
  return at.toISOString();
}

/** What an analysis reads its questions by: the questions linked to a situation, or an investigation's. */
export type QuestionScope = { linked: string } | { questionIds: string[] };

/** The question scope of an analysis. */
export function questionScope(analysis: Analysis): QuestionScope {
  if (analysis.kind === 'situation') return { linked: `situation:${analysis.situation.id}` };
  return { questionIds: (analysis.investigation.questionIds ?? []).slice(0, LINKED_QUESTIONS) };
}

/** Open questions that resolve before `end`, soonest first. */
export function dueQuestions(
  questions: readonly QuestionSummary[],
  end: string,
): QuestionSummary[] {
  const limit = Date.parse(end);
  return questions
    .filter((q) => q.status === 'open' && Date.parse(q.resolveBy) < limit)
    .sort((a, b) => Date.parse(a.resolveBy) - Date.parse(b.resolveBy));
}

/** A probability's trend level, as the mock's legend: High, Medium or Low. */
export type TrendLevel = 'High' | 'Medium' | 'Low';

/** The level of a probability: High from 60%, Medium from 35%, Low below. */
export function trendLevel(p: number): TrendLevel {
  if (p >= 0.6) return 'High';
  if (p >= 0.35) return 'Medium';
  return 'Low';
}

/** A level's sparkline color: High red, Medium amber, Low blue, as the mock's legend. */
export function levelTone(level: TrendLevel): 'danger' | 'warning' | 'info' {
  if (level === 'High') return 'danger';
  if (level === 'Medium') return 'warning';
  return 'info';
}

/** The probability pill's tone: green from 70%, as the mock's 74%, gray otherwise. */
export function pillTone(p: number | null | undefined): BadgeTone {
  return p !== null && p !== undefined && p >= 0.7 ? 'success' : 'neutral';
}

/** A probability as the pill writes it: "68%", or a dash for none. */
export function probabilityText(p: number | null | undefined): string {
  return p === null || p === undefined ? '—' : `${Math.round(p * 100)}%`;
}

/** The forecaster whose line is the question's trend: the ensemble, else the first with points. */
export function trendSeries(
  history: ForecastHistory,
  ensembleId?: string,
): ForecastHistory['series'][number] | undefined {
  return (
    history.series.find((s) => s.forecasterId === (ensembleId ?? 'ensemble')) ??
    history.series.find((s) => s.forecasterId === 'ensemble') ??
    history.series.find((s) => s.points.some((p) => typeof p.probability === 'number'))
  );
}

/** The probabilities of a forecaster's line, oldest first, its gaps left out. */
export function trendValues(series: ForecastHistory['series'][number] | undefined): number[] {
  return [...(series?.points ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => p.probability)
    .filter((p): p is number => typeof p === 'number');
}

/**
 * The trend arrow beside a probability: up or down when it moved two points or more over the
 * last week of the line (or the whole line, if shorter).
 */
export function trendArrow(values: readonly number[]): '↑' | '↓' | '' {
  if (values.length < 2) return '';
  const last = values.at(-1)!;
  const before = values[Math.max(0, values.length - 8)]!;
  if (last - before >= 0.02) return '↑';
  if (last - before <= -0.02) return '↓';
  return '';
}

/** The question's history as chart lines, one per forecaster, in percent. */
export function historyLines(history: ForecastHistory): ChartSeries[] {
  return history.series
    .map((series) => ({
      name: prettifyId(series.forecasterId),
      points: [...series.points]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((p): [number, number | null] => [
          Date.parse(`${p.date}T00:00:00Z`),
          typeof p.probability === 'number' ? Math.round(p.probability * 1000) / 10 : null,
        ]),
    }))
    .filter((line) => line.points.some(([, v]) => v !== null));
}

/** Each forecaster's latest forecast, newest first. */
export function latestByForecaster(forecasts: readonly Forecast[]): Forecast[] {
  const seen = new Set<string>();
  return [...forecasts]
    .sort((a, b) => Date.parse(b.madeAt) - Date.parse(a.madeAt))
    .filter((f) => !seen.has(f.forecasterId) && seen.add(f.forecasterId));
}

/**
 * What a forecast says, by the question's type: a probability; the likeliest outcome of a
 * distribution with its share; or a numeric median with its unit.
 */
export function forecastText(
  forecast: Forecast,
  question?: Pick<ForecastQuestion, 'outcomes'>,
): string {
  if (typeof forecast.probability === 'number') return probabilityText(forecast.probability);
  if (forecast.distribution) {
    const [label, p] = Object.entries(forecast.distribution).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (label !== undefined) return `${label} ${probabilityText(p)}`;
  }
  if (forecast.quantiles) {
    const unit = question?.outcomes?.unit;
    return `median ${forecast.quantiles.p50.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
  }
  return '—';
}

/** The scorecard's rows: those with the most resolved questions first. */
export function scorecardRows(entries: readonly ScorecardEntry[]): ScorecardEntry[] {
  return [...entries].sort(
    (a, b) => b.nResolved - a.nResolved || a.forecasterId.localeCompare(b.forecasterId),
  );
}

/** A score to three decimals, or a dash. */
export function scoreText(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(3);
}

/**
 * A reliability diagram's data: the 10-bin table and the recalibrated (PAV) curve. Both the
 * forecast probability calibration (`ForecastCalibration`) and the intel scope calibration
 * (`IntelCalibration`) carry this shape, so the two helpers below serve either (R2-010).
 */
export interface ReliabilityData {
  bins?: readonly {
    n?: number;
    meanForecast?: number | null;
    observedFrequency?: number | null;
  }[];
  curve?: readonly { forecast?: number; calibrated?: number }[];
}

/** The calibration's bins that hold forecasts, as chart dots. */
export function reliabilityBins(calibration: ReliabilityData): ReliabilityBin[] {
  return (calibration.bins ?? [])
    .filter(
      (bin) =>
        typeof bin.n === 'number' &&
        bin.n > 0 &&
        typeof bin.meanForecast === 'number' &&
        typeof bin.observedFrequency === 'number',
    )
    .map((bin) => ({ forecast: bin.meanForecast!, observed: bin.observedFrequency!, n: bin.n! }));
}

/** The recalibrated curve as chart points. */
export function calibrationCurve(calibration: ReliabilityData): [number, number][] {
  return (calibration.curve ?? [])
    .filter((point) => typeof point.forecast === 'number' && typeof point.calibrated === 'number')
    .map((point) => [point.forecast!, point.calibrated!]);
}
