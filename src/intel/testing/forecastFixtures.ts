import type {
  Forecast,
  ForecastCalibration,
  ForecastHistory,
  ForecastQuestion,
  ForecastScorecard,
  QuestionSummary,
} from '../forecastApi';

const DAY = 86_400_000;

/** An instant `days` days from when the tests load, so horizons hold whenever they run. */
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

/** A question summary with the fields every one shares. */
function summary(id: string, fields: Partial<QuestionSummary>): QuestionSummary {
  return {
    id,
    title: '',
    type: 'binary',
    status: 'open',
    category: 'seismic',
    resolverType: 'event-exists',
    opensAt: '2026-10-02T00:00:00Z',
    closesAt: inDays(10),
    resolveBy: inDays(30),
    origin: 'analyst',
    private: false,
    forecastCount: 3,
    ...fields,
  };
}

/** The outage question: 74%, resolving in 20 days (inside 1 month). */
export const outageQuestion = summary('01JA8Q00000000000000000010', {
  title: 'Outage affects over 10,000 customers in Sonoma County',
  category: 'outage',
  resolveBy: inDays(20),
  ensembleProbability: 0.74,
  estimativeTerm: 'likely',
});

/** The earthquake question: 8%, resolving in 70 days (inside 3 months). */
export const quakeQuestion = summary('01JA8Q00000000000000000011', {
  title: 'M5+ earthquake within 50 km of The Geysers',
  resolveBy: inDays(70),
  ensembleProbability: 0.08,
  estimativeTerm: 'very unlikely',
});

/** The swarm question: 32%, resolving in 150 days (inside 6 months, not 3). */
export const swarmQuestion = summary('01JA8Q00000000000000000012', {
  title: 'USGS declares the swarm over',
  resolveBy: inDays(150),
  ensembleProbability: 0.32,
  estimativeTerm: 'unlikely',
});

/** A closed question, never listed. */
export const closedQuestion = summary('01JA8Q00000000000000000013', {
  title: 'A closed question',
  status: 'closed',
  resolveBy: inDays(5),
});

/** The questions the stand-in lists for the situation. */
export const questions: QuestionSummary[] = [
  swarmQuestion,
  quakeQuestion,
  closedQuestion,
  outageQuestion,
];

/** A forecast on the outage question. */
function forecast(id: string, fields: Partial<Forecast>): Forecast {
  return {
    id,
    questionId: outageQuestion.id,
    forecasterId: 'ensemble',
    forecasterType: 'ensemble',
    madeAt: '2026-10-18T00:00:00Z',
    asOfSeq: 1000,
    recalibrated: false,
    manifestId: '01JA8Q00000000000000000020',
    ...fields,
  };
}

/** The outage question's forecasts: the ensemble, two base-rate forecasts and an LLM's. */
export const forecasts: Forecast[] = [
  forecast('01JA8Q00000000000000000021', {
    forecasterId: 'base-rate',
    forecasterType: 'base-rate',
    probability: 0.45,
    madeAt: '2026-10-05T00:00:00Z',
  }),
  forecast('01JA8Q00000000000000000022', { probability: 0.74 }),
  forecast('01JA8Q00000000000000000023', {
    forecasterId: 'base-rate',
    forecasterType: 'base-rate',
    probability: 0.5,
    madeAt: '2026-10-15T00:00:00Z',
  }),
  forecast('01JA8Q00000000000000000024', {
    forecasterId: 'llm-sonnet',
    forecasterType: 'llm',
    probability: 0.8,
    madeAt: '2026-10-17T00:00:00Z',
    rationale: 'Red-flag winds are forecast and the utility has announced shutoffs.',
  }),
];

/** The outage question in full. */
export const outageDetail: ForecastQuestion = {
  ...outageQuestion,
  resolutionCriteria: 'Yes if the utility reports more than 10,000 customers out at once.',
  resolver: { type: 'event-exists' },
  latestForecasts: [forecasts[1]!, forecasts[3]!, forecasts[2]!],
};

/**
 * The outage question's history: the ensemble rising from 60% to 73.5% over ten days, and the
 * base rate flat at 50%.
 */
export const outageHistory: ForecastHistory = {
  questionId: outageQuestion.id,
  type: 'binary',
  step: 'P1D',
  series: [
    {
      forecasterId: 'base-rate',
      points: Array.from({ length: 10 }, (_, i) => ({
        date: `2026-10-${String(9 + i).padStart(2, '0')}`,
        probability: 0.5,
        forecastId: forecasts[2]!.id,
      })),
    },
    {
      forecasterId: 'ensemble',
      points: Array.from({ length: 10 }, (_, i) => ({
        date: `2026-10-${String(9 + i).padStart(2, '0')}`,
        probability: Math.round((0.6 + 0.015 * i) * 1000) / 1000,
        forecastId: forecasts[1]!.id,
      })),
    },
  ],
};

/** A question with no history yet. */
export const emptyHistory = (questionId: string): ForecastHistory => ({
  questionId,
  type: 'binary',
  step: 'P1D',
  series: [],
});

/** The ledger: the ensemble scored on 34 questions, an LLM on too few. */
export const scorecard: ForecastScorecard = {
  retrospective: false,
  scorerVersion: '1.0.0',
  computedAt: '2026-10-18T00:00:00Z',
  entries: [
    {
      forecasterId: 'llm-sonnet',
      forecasterType: 'llm',
      nResolved: 12,
      label: 'insufficient',
      brier: 0.2,
    },
    {
      forecasterId: 'ensemble',
      forecasterType: 'ensemble',
      nResolved: 34,
      nForecasts: 140,
      label: 'ok',
      brier: 0.142,
      logScore: -0.41,
      skill: { value: 0.21, reference: 'base-rate', nShared: 30 },
    },
  ],
};

/** Calibration over 34 forecasts in three bins, with no recalibrated curve. */
export const calibration: ForecastCalibration = {
  n: 34,
  label: 'insufficient',
  method: 'bins',
  curve: [],
  bins: [
    { lower: 0, upper: 0.1, n: 10, meanForecast: 0.06, observedFrequency: 0.1 },
    { lower: 0.1, upper: 0.2, n: 0, meanForecast: null, observedFrequency: null },
    { lower: 0.4, upper: 0.5, n: 12, meanForecast: 0.45, observedFrequency: 0.5 },
    { lower: 0.7, upper: 0.8, n: 12, meanForecast: 0.74, observedFrequency: 0.67 },
  ],
  sharpness: 0.12,
  scorerVersion: '1.0.0',
  computedAt: '2026-10-18T00:00:00Z',
};
