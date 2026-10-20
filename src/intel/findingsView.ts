import type { BadgeTone } from '../ui/Badge';
import type { TimePoint } from '../ui/charts/chartOptions';
import { categoryOf } from '../lib/kindCategories';
import { prettifyId } from '../lib/labels';
import type {
  AnalysisSeries,
  AnalyticFinding,
  ImpactRate,
  ProjectedImpact,
  SeriesData,
} from './analyticsApi';
import type { InvestigationItem } from './investigationApi';
import type { SituationMember } from './situationApi';

/** The Evidence panel's tabs, as the mock names them (after All). */
export type EvidenceGroup = 'imagery' | 'signals' | 'reports' | 'docs';

/** The tabs in the mock's order, with their labels. */
export const EVIDENCE_GROUPS: readonly { key: EvidenceGroup; label: string }[] = [
  { key: 'imagery', label: 'Imagery' },
  { key: 'signals', label: 'Signals' },
  { key: 'reports', label: 'Reports' },
  { key: 'docs', label: 'Docs' },
];

/** Kinds that are written documents: news, bulletins, filings and posts. */
const DOC_KINDS: ReadonlySet<string> = new Set([
  'bulletin',
  'filing',
  'news-article',
  'news-story',
  'social-post',
  'travel-advisory',
  'dataset-release',
]);

/** One evidence row: a situation member or an investigation item, as the mock's EVIDENCE lists. */
export interface EvidenceRow {
  key: string;
  title: string;
  /** Where and when, as the row's second line. */
  detail: string;
  /** The source, kind and family tags. */
  tags: string[];
  group: EvidenceGroup;
  confidence: 'High' | 'Medium' | 'Low' | undefined;
  /** The object to open. */
  ref?: string;
}

/**
 * The Evidence tab a record or object belongs in: imagery kinds under Imagery; written documents
 * (news, bulletins, filings, posts) under Docs; events, findings, alerts and other derived objects
 * under Reports; every other record (sensor, track and telemetry kinds) under Signals.
 */
export function evidenceGroup(kind: string | null | undefined, derived: boolean): EvidenceGroup {
  if (kind && categoryOf(kind) === 'imagery') return 'imagery';
  if (kind && DOC_KINDS.has(kind)) return 'docs';
  if (derived) return 'reports';
  return 'signals';
}

/**
 * A member's confidence tag from its corroboration: High when corroborated, Low when not, Medium
 * when unknown; none when corroboration does not apply.
 */
export function memberConfidence(member: SituationMember): EvidenceRow['confidence'] {
  switch (member.corroboration) {
    case 'corroborated':
      return 'High';
    case 'uncorroborated':
      return 'Low';
    case 'unknown':
      return 'Medium';
    default:
      return undefined;
  }
}

/** A situation's members as evidence rows, newest observed first. */
export function memberEvidence(members: readonly SituationMember[]): EvidenceRow[] {
  return [...members]
    .sort((a, b) => Date.parse(b.observedAt ?? b.addedAt) - Date.parse(a.observedAt ?? a.addedAt))
    .map((member) => {
      const source = member.memberType === 'record' ? member.ref.split('/')[0] : undefined;
      return {
        key: member.id,
        title: member.title ?? member.kind ?? member.ref,
        detail: (member.observedAt ?? member.addedAt).slice(0, 16).replace('T', ' ') + 'Z',
        tags: [source, member.kind, member.signalFamily]
          .filter((tag): tag is string => !!tag)
          .map((tag) => prettifyId(tag)),
        group: evidenceGroup(member.kind, member.memberType !== 'record'),
        confidence: memberConfidence(member),
        ref: member.objectRef,
      };
    });
}

/** An investigation's items as evidence rows (notes left out), newest added first. */
export function itemEvidence(
  items: readonly InvestigationItem[],
  refOf: (item: InvestigationItem) => string | undefined,
  titleOf: (item: InvestigationItem) => string,
): EvidenceRow[] {
  return items
    .filter((item) => item.itemType !== 'note')
    .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
    .map((item) => {
      const kind = typeof item.snapshot?.['kind'] === 'string' ? item.snapshot['kind'] : undefined;
      const source = item.itemType === 'record' ? item.ref.split('/')[0] : undefined;
      return {
        key: item.id,
        title: titleOf(item),
        detail: `${item.addedAt.slice(0, 16).replace('T', ' ')}Z`,
        tags: [source, kind, item.itemType]
          .filter((tag): tag is string => !!tag)
          .map((tag) => prettifyId(tag)),
        group: evidenceGroup(kind, item.itemType !== 'record'),
        confidence: undefined,
        ref: refOf(item),
      };
    });
}

/** A finding severity's tag tone: significant is red, notable amber, info blue. */
export function findingTone(severity: AnalyticFinding['severity']): BadgeTone {
  if (severity === 'significant') return 'danger';
  if (severity === 'notable') return 'warning';
  return 'info';
}

/** The object a finding is about, to open: its first evidence member. */
export function findingRef(finding: AnalyticFinding): string | undefined {
  return finding.evidence.members[0];
}

/** One tab of the Metrics panel: a signal family and its series (at most four lines). */
export interface MetricTab {
  family: string;
  label: string;
  series: AnalysisSeries[];
}

/** The most lines one metrics chart draws, as the mock's four. */
export const MAX_LINES = 4;

/**
 * The Metrics panel's tabs: the series grouped by signal family (a series with none under Other),
 * the families in the order given (the situation's own first), each with at most
 * {@link MAX_LINES} series.
 */
export function metricTabs(
  series: readonly AnalysisSeries[],
  preferred: readonly string[] = [],
): MetricTab[] {
  const byFamily = new Map<string, AnalysisSeries[]>();
  for (const one of series) {
    const family = one.family ?? 'other';
    byFamily.set(family, [...(byFamily.get(family) ?? []), one]);
  }
  const rank = (family: string) => {
    const at = preferred.indexOf(family);
    return at === -1 ? preferred.length : at;
  };
  return [...byFamily]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([family, list]) => ({
      family,
      label: prettifyId(family),
      series: list.slice(0, MAX_LINES),
    }));
}

/**
 * A series' name for its legend and tile: an activity rollup's kind
 * (`rollup:{bucket}/{source}/{kind}/{region}`), otherwise the last part of its ref, prettified.
 */
export function seriesName(ref: string): string {
  const scheme = ref.slice(0, ref.indexOf(':'));
  const parts = ref.slice(ref.indexOf(':') + 1).split('/');
  const name = scheme === 'rollup' && parts.length >= 4 ? parts[2]! : (parts.at(-1) ?? ref);
  return prettifyId(name);
}

/** A series' points as chart points (period start, value); a gap's periods are null. */
export function seriesPoints(data: SeriesData): TimePoint[] {
  return data.points
    .map((point): TimePoint => [Date.parse(point.periodStart), point.value])
    .filter(([t]) => Number.isFinite(t))
    .sort((a, b) => a[0] - b[0]);
}

/** A stat tile: a series' total over the latest window, and its change from the window before. */
export interface StatTile {
  name: string;
  value: number;
  unit?: string | null;
  /** The change in percent; undefined when the window before had nothing. */
  delta?: number;
}

/**
 * A stat tile from a series (the mock's "1,946 Combat events (+12% vs. prev. 30d)"): the sum over
 * the `days` days to the series' latest point, and its change in percent from the `days` days
 * before. The window ends at the latest point rather than now, since series publish late.
 */
export function statTile(data: SeriesData, days: number): StatTile {
  const points = seriesPoints(data);
  const span = days * 86_400_000;
  const end = points.at(-1)?.[0] ?? 0;
  let current = 0;
  let previous = 0;
  for (const [t, v] of points) {
    if (v === null) continue;
    if (t > end - span) current += v;
    else if (t > end - 2 * span) previous += v;
  }
  return {
    name: seriesName(data.ref),
    value: current,
    unit: data.unit,
    ...(previous > 0 && { delta: Math.round(((current - previous) / previous) * 100) }),
  };
}

/** A percent from a probability, for pills: "68%". */
export function percentText(p: number | null | undefined): string {
  return p === null || p === undefined ? '—' : `${Math.round(p * 100)}%`;
}

/** The historical rate behind an impact: same hazard class, impact family and region class. */
export function rateFor(
  impact: ProjectedImpact,
  rates: readonly ImpactRate[],
): ImpactRate | undefined {
  return rates.find(
    (rate) =>
      rate.hazardClass === impact.hazard.hazardType &&
      rate.impactFamily === impact.impactFamily &&
      (impact.regionClass == null || rate.regionClass === impact.regionClass),
  );
}
