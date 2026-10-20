import type { Indicator } from './hypothesisApi';
import {
  confidenceText,
  confidenceTone,
  hypothesisScope,
  indicatorCounts,
  informationLevel,
  isNonDiagnostic,
  likelihoodFor,
  matrixRows,
  primarySet,
  priorText,
  probabilityTone,
  rankedHypotheses,
  rankedIndicators,
  ratingTone,
  trendArrow,
  trendText,
} from './hypothesesView';
import {
  foreshock,
  hypothesisSet,
  indicators,
  informationValue,
  injection,
  matrix,
  other,
  otherSet,
  SET_ID,
} from './testing/hypothesisFixtures';
import { investigation, situation, SITUATION_ID } from './testing/fixtures';

describe('the hypothesis sets of an analysis', () => {
  it('reads a situation’s sets by its id and an investigation’s by its links', () => {
    expect(hypothesisScope({ kind: 'situation', situation, members: [], timeline: [] })).toEqual({
      situationId: SITUATION_ID,
    });
    expect(
      hypothesisScope({
        kind: 'investigation',
        investigation: { ...investigation, hypothesisSetIds: [SET_ID] },
      }),
    ).toEqual({ setIds: [SET_ID] });
    expect(hypothesisScope({ kind: 'investigation', investigation })).toEqual({
      setIds: investigation.hypothesisSetIds ?? [],
    });
  });

  it('opens on the first active set', () => {
    expect(primarySet([otherSet, hypothesisSet])).toBe(hypothesisSet);
    expect(primarySet([otherSet])).toBe(otherSet);
    expect(primarySet([])).toBeUndefined();
  });
});

describe('the hypothesis rows', () => {
  it('numbers the hypotheses by probability', () => {
    expect(
      rankedHypotheses(hypothesisSet).map(({ hypothesis, tag }) => [tag, hypothesis.id]),
    ).toEqual([
      ['H1', injection.id],
      ['H2', foreshock.id],
      ['H3', other.id],
    ]);
  });

  it('colors the pill as the mock does and shows the trend', () => {
    expect([0.72, 0.21, 0.05, 0.03].map(probabilityTone)).toEqual([
      'success',
      'violet',
      'neutral',
      'danger',
    ]);
    expect(trendArrow(injection)).toBe('↑');
    expect(trendArrow(foreshock)).toBe('↓');
    expect(trendArrow(other)).toBe('');
    expect(trendText(injection)).toBe('+6 pts since the last revision');
    expect(trendText(foreshock)).toBe('-4 pts since the last revision');
    expect(trendText(other)).toBeUndefined();
  });

  it('writes the confidence as the backend names it', () => {
    expect(confidenceText('moderate')).toBe('Moderate');
    expect(confidenceTone('high')).toBe('success');
    expect(confidenceTone('moderate')).toBe('warning');
    expect(confidenceTone('low')).toBe('orange');
  });

  it('counts the observed of the live indicators, for and against', () => {
    expect(indicatorCounts(injection, indicators)).toEqual({
      observed: 2,
      total: 3,
      supporting: 1,
      contradicting: 0,
    });
    expect(indicatorCounts(foreshock, indicators)).toEqual({
      observed: 1,
      total: 2,
      supporting: 0,
      contradicting: 1,
    });
    expect(indicatorCounts(other, indicators)).toEqual({
      observed: 0,
      total: 0,
      supporting: 0,
      contradicting: 0,
    });
  });

  it('finds a likelihood keyed by the hypothesis’s label', () => {
    const byLabel: Indicator = {
      ...indicators[0]!,
      lr: { [other.label]: { class: 'low', direction: 'supports' } },
    };
    expect(likelihoodFor(byLabel, other)).toEqual({ class: 'low', direction: 'supports' });
  });

  it('writes the prior and its basis', () => {
    expect(priorText(injection)).toBe('prior 30% (base rate): Swarms at The Geysers since 2000');
    expect(priorText({ ...injection, priorBasis: { type: 'operator' } })).toBe(
      'prior 30% (operator)',
    );
  });
});

describe('the matrix and the information value', () => {
  it('lists the live rows heaviest first and flags the non-diagnostic one', () => {
    const rows = matrixRows(matrix);
    expect(rows.map((row) => row.weight)).toEqual([4, 1]);
    expect(isNonDiagnostic(matrix, rows[1]!)).toBe(true);
    expect(isNonDiagnostic(matrix, rows[0]!)).toBe(false);
    expect(isNonDiagnostic({ ...matrix, nonDiagnosticEvidenceIds: [rows[0]!.id] }, rows[0]!)).toBe(
      true,
    );
  });

  it('tones the ratings', () => {
    expect(['CC', 'C', 'N', 'NA', 'I', 'II', undefined].map((r) => ratingTone(r as never))).toEqual(
      ['success', 'success', 'neutral', 'neutral', 'warning', 'danger', 'neutral'],
    );
  });

  it('rates the best pending indicator’s gain against the set’s uncertainty', () => {
    expect(informationLevel(informationValue)).toBe('High');
    const scaled = (eig: number) => ({
      ...informationValue,
      indicators: [{ ...informationValue.indicators[0]!, eig }],
    });
    expect(informationLevel(scaled(0.1))).toBe('Medium');
    expect(informationLevel(scaled(0.04))).toBe('Low');
    expect(informationLevel({ ...informationValue, indicators: [] })).toBeUndefined();
    expect(informationLevel({ ...informationValue, entropy: 0 })).toBeUndefined();
    expect(informationLevel(undefined)).toBeUndefined();
  });

  it('ranks the pending indicators', () => {
    expect(rankedIndicators(informationValue).map((i) => i.rank)).toEqual([1, 2]);
  });
});
