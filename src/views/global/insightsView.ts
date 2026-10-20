import {
  Activity,
  Bell,
  CircleDot,
  Cloud,
  Coins,
  Diamond,
  Flame,
  HeartPulse,
  Lightbulb,
  Megaphone,
  Orbit,
  Plane,
  Radio,
  Scale,
  Shield,
  Ship,
  TriangleAlert,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityItem, InsightItem } from '../../state/contextSummary';
import type { BadgeTone } from '../../ui/Badge';

/** How an activity row's family looks: its icon, the icon's color and the chip's tone. */
export interface FamilyLook {
  icon: LucideIcon;
  color: string;
  tone: BadgeTone;
}

/**
 * The look of each signal family the backend's registry names (OpenAPI, `signalFamily`), by the
 * family's leading word, so `aviation-military` and `aviation-ops` share one. The registry is
 * operator-extensible; a family not listed here gets {@link OTHER_FAMILY}.
 */
const FAMILY_LOOKS: Record<string, FamilyLook> = {
  ais: { icon: Ship, color: '#6fb8f0', tone: 'info' },
  nav: { icon: Ship, color: '#6fb8f0', tone: 'info' },
  aviation: { icon: Plane, color: '#6fb8f0', tone: 'info' },
  conflict: { icon: Diamond, color: '#ff9b50', tone: 'orange' },
  outage: { icon: Wifi, color: '#ff5a5f', tone: 'danger' },
  internet: { icon: Wifi, color: '#c78bff', tone: 'violet' },
  gnss: { icon: Radio, color: '#c78bff', tone: 'violet' },
  attention: { icon: Megaphone, color: '#f0b070', tone: 'warning' },
  seismic: { icon: Activity, color: '#ff9b50', tone: 'orange' },
  fire: { icon: Flame, color: '#ff7a3a', tone: 'orange' },
  weather: { icon: Cloud, color: '#7fb2f0', tone: 'info' },
  cyber: { icon: Shield, color: '#ff5a5f', tone: 'violet' },
  markets: { icon: Coins, color: '#5fd0b0', tone: 'success' },
  sanctions: { icon: Scale, color: '#f0b070', tone: 'warning' },
  health: { icon: HeartPulse, color: '#ff5a5f', tone: 'danger' },
  space: { icon: Orbit, color: '#7fb2f0', tone: 'neutral' },
};

/** The look of a family not in {@link FAMILY_LOOKS}. */
const OTHER_FAMILY: FamilyLook = { icon: CircleDot, color: '#9aa4ae', tone: 'neutral' };

/** The look of an item with no family, by its type. */
const TYPE_LOOKS: Record<ActivityItem['type'], FamilyLook> = {
  alert: { icon: Bell, color: '#f0b070', tone: 'warning' },
  finding: { icon: Lightbulb, color: '#5fd0b0', tone: 'teal' },
  'situation-change': { icon: TriangleAlert, color: '#f0b070', tone: 'warning' },
  record: OTHER_FAMILY,
};

/** An activity row's look: by its signal family, or by its type when it has none. */
export function activityLook(item: Pick<ActivityItem, 'signalFamily' | 'type'>): FamilyLook {
  if (!item.signalFamily) return TYPE_LOOKS[item.type];
  return FAMILY_LOOKS[item.signalFamily.split('-')[0]!] ?? OTHER_FAMILY;
}

/** The chip on an activity row: the family in words (`weather-severe` reads Weather Severe). */
export function familyLabel(item: Pick<ActivityItem, 'signalFamily' | 'type'>): string {
  const words = (item.signalFamily ?? item.type).split('-');
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/** A filter choice of the timeline: every family, or one family (or type) by its label. */
export const ALL_SOURCES = 'All Sources';

/** The families in a feed, by label, in the order they first appear. */
export function familiesOf(activity: readonly ActivityItem[]): string[] {
  return [...new Set(activity.map(familyLabel))];
}

/** The rows of the feed the filter lets through. */
export function filterActivity(activity: readonly ActivityItem[], family: string): ActivityItem[] {
  return family === ALL_SOURCES
    ? [...activity]
    : activity.filter((item) => familyLabel(item) === family);
}

/** A row's time as the mock shows it: hours and minutes, in UTC. */
export function activityTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(11, 16);
}

/** The insight panel's tabs, and the insight kind each lists (the fourth lists related objects). */
export type InsightTab = 'detections' | 'hypotheses' | 'forecasts' | 'related';

/** The insight kind each of the first three tabs lists. */
export const TAB_KINDS: Record<Exclude<InsightTab, 'related'>, InsightItem['kind']> = {
  detections: 'finding',
  hypotheses: 'band-change',
  forecasts: 'forecast',
};

/** The insights a tab lists, in the backend's order. */
export function insightsFor(
  insights: readonly InsightItem[],
  tab: Exclude<InsightTab, 'related'>,
): InsightItem[] {
  return insights.filter((insight) => insight.kind === TAB_KINDS[tab]);
}

/** Who issued an insight, in words (`foresignal-ensemble` reads ForeSignal ensemble). */
export function issuerLabel(issuer: string): string {
  if (issuer === 'official') return 'Official';
  if (issuer === 'foresignal-ensemble') return 'ForeSignal ensemble';
  return issuer;
}

/**
 * The line under an insight's title: what it rests on — who issued it, the base rate and the
 * knowledge cutoff — as far as the backend gives them, and whether a language model wrote the
 * text.
 */
export function insightBasis(insight: InsightItem): string {
  const parts: string[] = [];
  if (insight.issuer) parts.push(`Issued by ${issuerLabel(insight.issuer)}`);
  if (typeof insight.baseRate === 'number') parts.push(`base rate ${percent(insight.baseRate)}`);
  if (insight.knowledgeCutoff) parts.push(`knowledge to ${insight.knowledgeCutoff}`);
  if (insight.textOrigin === 'llm') parts.push('text written by a language model');
  return parts.join(' · ');
}

/** A probability (0–1) as a whole percent. */
export function percent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

/** The tag after the percent: the ICD 203 term, capitalized, toned by how likely it says. */
export function termTag(
  term: InsightItem['estimativeTerm'],
): { label: string; tone: BadgeTone } | undefined {
  if (!term) return undefined;
  const label = term.charAt(0).toUpperCase() + term.slice(1);
  if (term === 'likely' || term === 'very likely' || term === 'almost certain') {
    return { label, tone: 'teal' };
  }
  if (term === 'roughly even chance') return { label, tone: 'warning' };
  return { label, tone: 'info' };
}
