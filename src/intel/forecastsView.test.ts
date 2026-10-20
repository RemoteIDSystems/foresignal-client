import {
  calibrationCurve,
  DEFAULT_HORIZON,
  dueQuestions,
  forecastText,
  historyLines,
  HORIZONS,
  horizonEnd,
  latestByForecaster,
  levelTone,
  pillTone,
  probabilityText,
  questionScope,
  reliabilityBins,
  scorecardRows,
  scoreText,
  trendArrow,
  trendLevel,
  trendSeries,
  trendValues,
} from './forecastsView';
import {
  calibration,
  emptyHistory,
  forecasts,
  outageQuestion,
  outageHistory,
  questions,
  quakeQuestion,
  scorecard,
} from './testing/forecastFixtures';
import { investigation, situation, SITUATION_ID } from './testing/fixtures';

const DAY = 86_400_000;

describe('the horizons and the questions', () => {
  it('offers the mock’s four horizons, three months first', () => {
    expect(HORIZONS.map((h) => h.label)).toEqual(['1 month', '3 months', '6 months', '1 year']);
    expect(DEFAULT_HORIZON.label).toBe('3 months');
    expect(horizonEnd(3, Date.parse('2026-10-20T12:00:00Z'))).toBe('2027-01-20T12:00:00.000Z');
    expect(horizonEnd(12, Date.parse('2026-10-20T12:00:00Z'))).toBe('2027-10-20T12:00:00.000Z');
  });

  it('reads a situation’s linked questions and an investigation’s own', () => {
    expect(questionScope({ kind: 'situation', situation, members: [], timeline: [] })).toEqual({
      linked: `situation:${SITUATION_ID}`,
    });
    expect(
      questionScope({
        kind: 'investigation',
        investigation: { ...investigation, questionIds: [outageQuestion.id] },
      }),
    ).toEqual({ questionIds: [outageQuestion.id] });
  });

  it('keeps the open questions due within the horizon, soonest first', () => {
    const end = new Date(Date.now() + 100 * DAY).toISOString();
    expect(dueQuestions(questions, end).map((q) => q.id)).toEqual([
      outageQuestion.id,
      quakeQuestion.id,
    ]);
    expect(dueQuestions(questions, new Date(Date.now() + 400 * DAY).toISOString())).toHaveLength(3);
  });
});

describe('the rows', () => {
  it('colors the trend by level and the pill green from 70%', () => {
    expect([0.74, 0.6, 0.5, 0.35, 0.32].map(trendLevel)).toEqual([
      'High',
      'High',
      'Medium',
      'Medium',
      'Low',
    ]);
    expect(levelTone('High')).toBe('danger');
    expect(levelTone('Medium')).toBe('warning');
    expect(levelTone('Low')).toBe('info');
    expect(pillTone(0.74)).toBe('success');
    expect(pillTone(0.68)).toBe('neutral');
    expect(pillTone(null)).toBe('neutral');
    expect(probabilityText(0.08)).toBe('8%');
    expect(probabilityText(undefined)).toBe('—');
  });

  it('takes the ensemble’s line as the trend and reads its arrow over the last week', () => {
    const series = trendSeries(outageHistory);
    expect(series?.forecasterId).toBe('ensemble');
    const values = trendValues(series);
    expect(values).toHaveLength(10);
    expect(values[0]).toBe(0.6);
    expect(trendArrow(values)).toBe('↑');
    expect(trendArrow([...values].reverse())).toBe('↓');
    expect(trendArrow([0.5, 0.5, 0.51])).toBe('');
    expect(trendArrow([0.5])).toBe('');
    expect(trendValues(trendSeries(emptyHistory(quakeQuestion.id)))).toEqual([]);
  });

  it('draws the history as a line per forecaster, in percent', () => {
    const lines = historyLines(outageHistory);
    expect(lines.map((line) => line.name)).toEqual(['Base Rate', 'Ensemble']);
    expect(lines[1]!.points[0]).toEqual([Date.parse('2026-10-09T00:00:00Z'), 60]);
  });

  it('keeps each forecaster’s latest forecast, newest first', () => {
    const latest = latestByForecaster(forecasts);
    expect(latest.map((f) => [f.forecasterId, f.probability])).toEqual([
      ['ensemble', 0.74],
      ['llm-sonnet', 0.8],
      ['base-rate', 0.5],
    ]);
  });

  it('writes a forecast by its kind', () => {
    expect(forecastText(forecasts[1]!)).toBe('74%');
    expect(
      forecastText({ ...forecasts[1]!, probability: null, distribution: { A: 0.2, B: 0.7 } }),
    ).toBe('B 70%');
    expect(
      forecastText(
        {
          ...forecasts[1]!,
          probability: null,
          quantiles: { p05: 800, p25: 1000, p50: 1200, p75: 1400, p95: 1800 },
        },
        { outcomes: { unit: 'MW' } },
      ),
    ).toBe('median 1,200 MW');
  });
});

describe('the ledger', () => {
  it('lists the forecasters with the most resolved questions first', () => {
    expect(scorecardRows(scorecard.entries).map((e) => e.forecasterId)).toEqual([
      'ensemble',
      'llm-sonnet',
    ]);
    expect(scoreText(0.142)).toBe('0.142');
    expect(scoreText(null)).toBe('—');
  });

  it('plots the bins that hold forecasts, and the curve', () => {
    expect(reliabilityBins(calibration)).toEqual([
      { forecast: 0.06, observed: 0.1, n: 10 },
      { forecast: 0.45, observed: 0.5, n: 12 },
      { forecast: 0.74, observed: 0.67, n: 12 },
    ]);
    expect(
      calibrationCurve({ ...calibration, curve: [{ forecast: 0.2, calibrated: 0.25 }] }),
    ).toEqual([[0.2, 0.25]]);
  });
});
