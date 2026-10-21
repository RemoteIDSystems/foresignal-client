import {
  CalendarClock,
  FileText,
  FlaskConical,
  GitCompare,
  Map as MapIcon,
  Network,
  Search,
  TrendingUp,
  Users,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { itemRef } from '../../intel/analysisView';
import type { Investigation } from '../../intel/investigationApi';
import { parseObjectRef } from '../../lib/objectRef';
import { COMMON_MAX_REFS, GRAPH_MAX_SEEDS, type RelationType } from '../../graph/graphApi';

/** What the workbench is opened on: an investigation, a situation, or some objects by ref. */
export type WorkbenchSubject =
  | { kind: 'investigation'; id: string }
  | { kind: 'situation'; id: string }
  | { kind: 'refs'; refs: string[] }
  | { kind: 'none' };

/** The workbench's routes. */
export const WORKBENCH_ROUTE = '/analyst';

/**
 * The workbench path for an object: an investigation's or situation's own, else the object as the
 * graph's seed (`/analyst?ref=…`).
 */
export function workbenchPath(ref: string): string {
  const parts = parseObjectRef(ref);
  if (parts?.type === 'investigation' || parts?.type === 'situation') {
    return `${WORKBENCH_ROUTE}/${parts.type}s/${encodeURIComponent(parts.id)}`;
  }
  return `${WORKBENCH_ROUTE}?ref=${encodeURIComponent(ref)}`;
}

/**
 * The graph's seeds for an investigation: the investigation itself, then each item's object ref,
 * once each, at most {@link GRAPH_MAX_SEEDS}.
 */
export function investigationSeeds(investigation: Investigation): string[] {
  const refs = [
    `investigation:${investigation.id}`,
    ...(investigation.items ?? []).map(itemRef).filter((ref): ref is string => ref !== undefined),
  ];
  return [...new Set(refs)].slice(0, GRAPH_MAX_SEEDS);
}

/**
 * The objects whose common dependencies are looked for: the seeds other than situations and
 * investigations (which depend on nothing themselves), at most {@link COMMON_MAX_REFS}.
 */
export function commonRefs(seeds: readonly string[]): string[] {
  return seeds
    .filter((ref) => {
      const type = parseObjectRef(ref)?.type;
      return type !== 'situation' && type !== 'investigation';
    })
    .slice(0, COMMON_MAX_REFS);
}

/** The graph query the filters ask for: the seeds, how far out, and which relation types. */
export interface GraphQueryKey {
  seeds: string[];
  depth: 1 | 2;
  relation?: RelationType;
}

/** A rail entry: its label, icon, and the analysis tab it opens, if any. */
export interface ToolEntry {
  label: string;
  icon: LucideIcon;
  /** The full-analysis tab it opens for the workbench's investigation or situation. */
  tab?: string;
  /** This screen itself. */
  current?: boolean;
}

/**
 * The ANALYSIS TOOLS rail, in the Analyst Workbench mock's order. Entries with a full-analysis tab
 * open it; Correlation Finder and Pattern Search have no screen and are shown disabled.
 */
export const WORKBENCH_TOOLS: readonly ToolEntry[] = [
  { label: 'Evidence Graph', icon: Waypoints, current: true },
  { label: 'Timeline', icon: CalendarClock, tab: 'timeline' },
  { label: 'Geospatial Analysis', icon: MapIcon, tab: 'map' },
  { label: 'Entity Explorer', icon: Users, tab: 'entities' },
  { label: 'Correlation Finder', icon: GitCompare },
  { label: 'Pattern Search', icon: Search },
  { label: 'What Changed?', icon: Network, tab: 'overview' },
  { label: 'Hypothesis Builder', icon: FlaskConical, tab: 'hypotheses' },
  { label: 'Forecasts', icon: TrendingUp, tab: 'forecasts' },
  { label: 'Reports', icon: FileText, tab: 'reports' },
];
