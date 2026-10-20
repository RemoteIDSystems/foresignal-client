import {
  BarChart3,
  BookOpen,
  Bot,
  FileText,
  FlaskConical,
  Gauge,
  GitCompare,
  Lightbulb,
  Network,
  Save,
  Sigma,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { FsError } from '../../api/errors';
import type { AnalysisKind } from '../../intel/analysisView';
import type { InvestigationItemInput } from '../../intel/investigationApi';

/** The tabs of the full-analysis frame, in the mock's order. */
export const ANALYSIS_TABS = [
  'overview',
  'analysis',
  'timeline',
  'map',
  'entities',
  'evidence',
  'hypotheses',
  'forecasts',
  'related',
  'reports',
  'export',
] as const;

/** One tab of the frame. */
export type AnalysisTab = (typeof ANALYSIS_TABS)[number];

/** The prompts that fill the tabs this one does not, shown on those tabs until then. */
export const PENDING_TABS: Readonly<Partial<Record<AnalysisTab, string>>> = {
  analysis: '023 (Assessments)',
  reports: 'a later prompt',
};

/** The timeline and what-changed windows, in days; `all` reads from the beginning. */
export const RANGES = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: undefined },
] as const;

/** A range's start: so many days before `now`, to the hour (so a re-render asks the same thing). */
export function rangeStart(days: number | undefined, now: number): string {
  if (days === undefined) return '2000-01-01T00:00:00Z';
  const hour = 3_600_000;
  return new Date(Math.floor((now - days * 86_400_000) / hour) * hour).toISOString();
}

/** What a failed first load says: a token, a missing object, or the backend's own message. */
export function problemText(error: unknown, kind: AnalysisKind): string {
  if (error instanceof FsError) {
    if (error.status === 401) {
      return `Opening an ${kind === 'investigation' ? 'investigation' : 'object'} needs an access token. Add one in Settings.`;
    }
    if (error.status === 404) return `This ${kind} does not exist, or is not shared with you.`;
    return error.message;
  }
  return error instanceof Error ? error.message : `The ${kind} did not load.`;
}

/** A rail entry: what it is called, its icon, and the analysis tab it opens, if any. */
export interface RailEntry {
  label: string;
  icon: LucideIcon;
  /** The tab it opens on an analysis view; the Situations entry goes to the list instead. */
  tab?: string;
  /** Opens the situations and investigations list. */
  home?: boolean;
  /** The prompt that builds it, for an entry that does nothing yet. */
  later?: string;
}

/** The ANALYSIS section, in the Conflict mock's order. */
export const ANALYSIS_ENTRIES: readonly RailEntry[] = [
  { label: 'Situations', icon: Network, home: true },
  { label: 'Analytic Findings', icon: Lightbulb, tab: 'evidence' },
  { label: 'Hypotheses', icon: FlaskConical, tab: 'hypotheses' },
  { label: 'Forecasts', icon: TrendingUp, tab: 'forecasts' },
  { label: 'Indicators', icon: Gauge, tab: 'hypotheses' },
  { label: 'Base Rates', icon: Sigma, tab: 'evidence' },
  { label: 'Comparisons', icon: GitCompare, later: 'a later prompt' },
  { label: 'Reports', icon: FileText, tab: 'reports' },
];

/** The TOOLS section, in the mock's order. */
export const TOOL_ENTRIES: readonly RailEntry[] = [
  { label: 'Ask ForeSignal', icon: Bot, later: 'the Global dashboard (017)' },
  { label: 'Analysis Builder', icon: BarChart3, later: '024' },
  { label: 'Saved Views', icon: Save, later: '031' },
  { label: 'Workspaces', icon: BookOpen, later: '025' },
];

/** The item types an analyst can add by hand, in the form's order. */
export const ADDABLE_ITEM_TYPES: readonly InvestigationItemInput['itemType'][] = [
  'record',
  'alert',
  'event',
  'anomaly',
  'object',
  'note',
];

/** How many timeline rows the Overview shows; the Timeline tab shows them all. */
export const OVERVIEW_TIMELINE_ROWS = 8;
