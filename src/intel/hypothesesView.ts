import type { BadgeTone } from '../ui/Badge';
import { prettifyId } from '../lib/labels';
import type {
  AchEvidence,
  AchMatrix,
  AchRating,
  Hypothesis,
  HypothesisSet,
  Indicator,
  InformationValue,
} from './hypothesisApi';
import type { InformationLevel } from '../views/analysis/AnalysisHeader';
import type { Analysis } from './useAnalysis';

/** The most sets an investigation's links are read for, one request each. */
export const LINKED_SETS = 20;

/** What an analysis reads its hypothesis sets by: a situation's id, or an investigation's links. */
export type HypothesisScope = { situationId: string } | { setIds: string[] };

/** The hypothesis scope of an analysis. */
export function hypothesisScope(analysis: Analysis): HypothesisScope {
  if (analysis.kind === 'situation') return { situationId: analysis.situation.id };
  return { setIds: (analysis.investigation.hypothesisSetIds ?? []).slice(0, LINKED_SETS) };
}

/** The set the header and the tab open on: the first active one, else the first. */
export function primarySet(sets: readonly HypothesisSet[]): HypothesisSet | undefined {
  return sets.find((set) => set.status === 'active') ?? sets[0];
}

/** A set's hypotheses, most probable first, each with its row label (H1, H2, …). */
export function rankedHypotheses(set: HypothesisSet): { hypothesis: Hypothesis; tag: string }[] {
  return [...set.hypotheses]
    .sort((a, b) => b.probability - a.probability)
    .map((hypothesis, i) => ({ hypothesis, tag: `H${i + 1}` }));
}

/**
 * A probability pill's tone, as the Conflict mock colors its four: green from 50%, violet from 15%,
 * gray from 5%, red below.
 */
export function probabilityTone(p: number): BadgeTone {
  if (p >= 0.5) return 'success';
  if (p >= 0.15) return 'violet';
  if (p >= 0.05) return 'neutral';
  return 'danger';
}

/** The trend arrow beside a probability: up or down when it moved half a point or more. */
export function trendArrow(hypothesis: Hypothesis): '↑' | '↓' | '' {
  const delta = hypothesis.change?.delta ?? 0;
  if (delta >= 0.005) return '↑';
  if (delta <= -0.005) return '↓';
  return '';
}

/** The change since the previous revision, in points: "+6 pts since the last revision". */
export function trendText(hypothesis: Hypothesis): string | undefined {
  const change = hypothesis.change;
  if (!change) return undefined;
  const points = Math.round(change.delta * 100);
  if (points === 0) return 'Unchanged since the last revision';
  return `${points > 0 ? '+' : ''}${points} pts since the last revision`;
}

/** A confidence level's word, as the backend names it: Low, Moderate or High. */
export function confidenceText(level: HypothesisSet['confidence']): string {
  return prettifyId(level);
}

/** A confidence level's tone: high green, moderate amber, low orange. */
export function confidenceTone(level: HypothesisSet['confidence']): BadgeTone {
  if (level === 'high') return 'success';
  if (level === 'moderate') return 'warning';
  return 'orange';
}

/** An indicator's likelihood for a hypothesis: keyed by its id, or its label when created with the set. */
export function likelihoodFor(indicator: Indicator, hypothesis: Hypothesis) {
  return indicator.lr[hypothesis.id] ?? indicator.lr[hypothesis.label];
}

/** How a hypothesis's indicators stand: observed of linked, and the observed ones by direction. */
export interface IndicatorCounts {
  observed: number;
  total: number;
  supporting: number;
  contradicting: number;
}

/**
 * The mock's "Indicators: 8/12" for a hypothesis: of the live (not retired) indicators that bear on
 * it, how many are observed; and of those, how many support it and how many weaken it (a neutral
 * likelihood counts as neither).
 */
export function indicatorCounts(
  hypothesis: Hypothesis,
  indicators: readonly Indicator[],
): IndicatorCounts {
  const counts: IndicatorCounts = { observed: 0, total: 0, supporting: 0, contradicting: 0 };
  for (const indicator of indicators) {
    if (indicator.state === 'retired') continue;
    const likelihood = likelihoodFor(indicator, hypothesis);
    if (!likelihood) continue;
    counts.total += 1;
    if (indicator.state !== 'observed') continue;
    counts.observed += 1;
    if (likelihood.class === 'neutral') continue;
    if (likelihood.direction === 'supports') counts.supporting += 1;
    else if (likelihood.direction === 'weakens') counts.contradicting += 1;
  }
  return counts;
}

/** A hypothesis's prior and its basis, for its detail line. */
export function priorText(hypothesis: Hypothesis): string {
  const basis = hypothesis.priorBasis;
  const from = `prior ${Math.round(hypothesis.prior * 100)}% (${prettifyId(basis.type).toLowerCase()})`;
  return basis.rationale ? `${from}: ${basis.rationale}` : from;
}

/** What each ACH rating means, for the matrix's key and its cells' titles. */
export const RATING_TEXT: Readonly<Record<AchRating, string>> = {
  CC: 'Very consistent',
  C: 'Consistent',
  N: 'Neutral',
  NA: 'Not applicable',
  I: 'Inconsistent',
  II: 'Very inconsistent',
};

/** An ACH rating's cell tone: consistent green, neutral gray, inconsistent amber, very red. */
export function ratingTone(rating: AchRating | undefined): BadgeTone {
  switch (rating) {
    case 'CC':
    case 'C':
      return 'success';
    case 'I':
      return 'warning';
    case 'II':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** The matrix's live rows (removed ones left out), heaviest first. */
export function matrixRows(matrix: AchMatrix): AchEvidence[] {
  return matrix.rows
    .filter((row) => !row.removedAt)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
}

/** Whether a row cannot tell the hypotheses apart, by its own flag or the matrix's list. */
export function isNonDiagnostic(matrix: AchMatrix, row: AchEvidence): boolean {
  return row.nonDiagnostic === true || (matrix.nonDiagnosticEvidenceIds ?? []).includes(row.id);
}

/**
 * The header's Information Value: how much the best pending indicator would reduce the set's
 * uncertainty, as its expected information gain over the set's entropy: High from a quarter,
 * Medium from a tenth, Low below; nothing when nothing is pending or the set is already certain.
 */
export function informationLevel(
  value: InformationValue | undefined,
): InformationLevel | undefined {
  if (!value || value.indicators.length === 0 || value.entropy <= 0) return undefined;
  const best = Math.max(...value.indicators.map((indicator) => indicator.eig));
  const share = best / value.entropy;
  if (share >= 0.25) return 'High';
  if (share >= 0.1) return 'Medium';
  return 'Low';
}

/** The pending indicators by rank. */
export function rankedIndicators(value: InformationValue): InformationValue['indicators'] {
  return [...value.indicators].sort((a, b) => a.rank - b.rank);
}
