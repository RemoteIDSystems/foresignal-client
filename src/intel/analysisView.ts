import type { components } from '../api/generated/schema';
import { categoryOf, KIND_CATEGORIES, type CategoryId } from '../lib/kindCategories';
import { parseObjectRef, recordRef } from '../lib/objectRef';
import type { BadgeTone } from '../ui/Badge';
import type { InvestigationItem } from './investigationApi';
import type { SituationChanges, SituationTimelineEntry } from './situationApi';

/** An action an object's envelope offers the caller (`ObjectAction`). */
type ObjectAction = components['schemas']['ObjectAction'];

/** What a full-analysis view shows: a situation or an investigation. */
export type AnalysisKind = 'situation' | 'investigation';

/** The route of each kind's full-analysis view, under the Intelligence tab. */
export const ANALYSIS_ROUTES: Readonly<Record<AnalysisKind, string>> = {
  situation: '/intelligence/situations',
  investigation: '/intelligence/investigations',
};

/**
 * The full-analysis route for a `situation:` or `investigation:` ref, so that selecting one from
 * the map, the insights, search or a dossier opens it; undefined for any other ref.
 */
export function analysisPath(ref: string): string | undefined {
  const parts = parseObjectRef(ref);
  if (!parts || (parts.type !== 'situation' && parts.type !== 'investigation')) return undefined;
  return `${ANALYSIS_ROUTES[parts.type]}/${encodeURIComponent(parts.id)}`;
}

/**
 * How long something has run, as the mock writes it: "3 yrs 6 mos", "12 days", "5 h", or
 * "under an hour".
 */
export function durationText(startIso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 3_600_000) return 'under an hour';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} days`;
  const months = Math.floor(days / 30.4375);
  if (months < 12) return `${months} mos`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} ${years === 1 ? 'yr' : 'yrs'}${rest > 0 ? ` ${rest} mos` : ''}`;
}

/** The scope line from a situation's region codes: "Global impact" for many, else the codes. */
export function scopeText(regionCodes: readonly string[]): string {
  const codes = regionCodes.filter((code) => code !== 'ZZ');
  if (codes.length === 0) return 'No region';
  if (codes.length > 4) return `${codes.length} regions`;
  return codes.join(', ');
}

/** The header's confidence gauge: a percent and its word. */
export interface ConfidenceLook {
  percent: number;
  label: 'LOW' | 'MODERATE' | 'HIGH';
  tone: BadgeTone;
}

/**
 * The confidence gauge from a situation's corroboration share (corroborated ÷ corroborated plus
 * uncorroborated members): low under 40%, moderate under 70%, high from there. Undefined when no
 * member can be corroborated.
 */
export function confidenceLook(share: number | null | undefined): ConfidenceLook | undefined {
  if (share === null || share === undefined || !Number.isFinite(share)) return undefined;
  const percent = Math.round(Math.min(1, Math.max(0, share)) * 100);
  if (percent < 40) return { percent, label: 'LOW', tone: 'danger' };
  if (percent < 70) return { percent, label: 'MODERATE', tone: 'warning' };
  return { percent, label: 'HIGH', tone: 'success' };
}

/** A status badge's tone: active is green, emerging and open inform, dormant warns, the rest are neutral. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'emerging':
    case 'open':
      return 'info';
    case 'dormant':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** A severity badge's tone. */
export function severityTone(severity: string | null | undefined): BadgeTone {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'info';
}

/** One row of the timeline, as the mock's CONFLICT TIMELINE lists them. */
export interface TimelineRow {
  key: string;
  at: string;
  title: string;
  /** The member's signal family, or the log entry's action. */
  tag: string;
  severity?: string | null;
  /** The member's object, to select. */
  ref?: string;
}

const LOG_TEXT: Readonly<Record<string, string>> = {
  created: 'Situation opened',
  member_added: 'Member added',
  member_removed: 'Member removed',
  status: 'Status changed',
  severity: 'Severity changed',
  merged: 'Merged',
  split: 'Split',
  renamed: 'Renamed',
  theme: 'Theme changed',
  brief: 'Brief updated',
};

/**
 * Timeline entries as rows, newest first: a member by its title (or kind) and signal family; a
 * log entry by what it did, with the value it changed to when it says one.
 */
export function timelineRows(entries: readonly SituationTimelineEntry[]): TimelineRow[] {
  return entries
    .map((entry, index): TimelineRow => {
      if (entry.entryType === 'member' && entry.member) {
        const member = entry.member;
        return {
          key: `m-${member.id}-${index}`,
          at: entry.at,
          title: member.title ?? member.kind ?? member.ref,
          tag: member.signalFamily ?? member.memberType,
          severity: member.severity,
          ref: member.objectRef,
        };
      }
      const action = entry.action ?? 'log';
      const after = entry.after
        ? Object.values(entry.after).find((v) => typeof v === 'string')
        : '';
      return {
        key: `l-${index}`,
        at: entry.at,
        title: `${LOG_TEXT[action] ?? action}${after ? `: ${String(after)}` : ''}`,
        tag: action.replace(/_/g, ' '),
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The what-changed lines, in the order the backend's diff gives them; empty when nothing did. */
export function changesLines(changes: SituationChanges): string[] {
  const lines: string[] = [];
  if (changes.status.changed) {
    lines.push(`Status ${changes.status.before ?? 'new'} → ${changes.status.after}`);
  }
  if (changes.severity.changed) {
    lines.push(`Severity ${changes.severity.before ?? 'new'} → ${changes.severity.after}`);
  }
  if (changes.newMembers.total > 0) {
    const families = Object.entries(changes.newMembers.byFamily)
      .sort((a, b) => b[1] - a[1])
      .map(([family, count]) => `${family} ${count}`)
      .join(', ');
    lines.push(
      `${changes.newMembers.total} new ${changes.newMembers.total === 1 ? 'member' : 'members'}${
        families ? ` (${families})` : ''
      }`,
    );
  }
  const delta = changes.area?.deltaKm2;
  if (delta !== null && delta !== undefined && delta !== 0) {
    lines.push(
      `Area ${delta > 0 ? '+' : '−'}${Math.round(Math.abs(delta)).toLocaleString('en-US')} km²`,
    );
  }
  if (changes.regionsAdded && changes.regionsAdded.length > 0) {
    lines.push(`Regions added: ${changes.regionsAdded.join(', ')}`);
  }
  if (changes.regionsRemoved && changes.regionsRemoved.length > 0) {
    lines.push(`Regions removed: ${changes.regionsRemoved.join(', ')}`);
  }
  return lines;
}

/** The camera over a bbox: its middle, from high enough to see all of it. */
export function focusOf(
  bbox: readonly number[] | null | undefined,
): { longitude: number; latitude: number; height: number } | undefined {
  if (!bbox || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) return undefined;
  const [minLon, minLat, maxLon, maxLat] = bbox as [number, number, number, number];
  const span = Math.max(maxLon - minLon, maxLat - minLat);
  // A degree is about 111 km; the view takes the span with a margin, from 200 km to 15,000 km.
  const height = Math.min(15_000_000, Math.max(200_000, span * 111_000 * 1.6));
  return { longitude: (minLon + maxLon) / 2, latitude: (minLat + maxLat) / 2, height };
}

/** An investigation item's display title: its snapshot's title, else its note, else its ref. */
export function itemTitle(item: InvestigationItem): string {
  const title = item.snapshot?.['title'];
  if (typeof title === 'string' && title.trim()) return title;
  return item.note?.trim() || item.ref;
}

/**
 * An investigation item's object ref, to select it: the backend's own when given; else, for a
 * record (`{sourceId}/{externalId}`) or an alert, the ref read from the item; else, for an item
 * whose ref is already an object ref, that. Events, anomalies, places, notes and briefing runs
 * without the backend's `objectRef` select nothing: the OpenAPI names no ref type for them.
 */
export function itemRef(item: InvestigationItem): string | undefined {
  if (item.objectRef) return item.objectRef;
  switch (item.itemType) {
    case 'record': {
      const slash = item.ref.indexOf('/');
      if (slash <= 0) return undefined;
      return recordRef(item.ref.slice(0, slash), item.ref.slice(slash + 1), item.seq ?? undefined);
    }
    case 'alert':
      return `alert:${item.ref}`;
    case 'object':
    case 'evidence-item':
    case 'attachment':
      return parseObjectRef(item.ref) ? item.ref : undefined;
    default:
      return undefined;
  }
}

/**
 * Whether an envelope offers a method on a path, matched on the action's href rather than its id:
 * the investigation's own envelope says whether this caller may add or remove items.
 */
export function envelopeAllows(
  actions: readonly ObjectAction[] | undefined,
  method: ObjectAction['method'],
  path: RegExp,
): boolean {
  return (actions ?? []).some((action) => action.method === method && path.test(action.href));
}

/** A UTC instant as the mock's rows write it: "2025-09-18 14:32Z". */
export function utcText(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return `${at.toISOString().slice(0, 16).replace('T', ' ')}Z`;
}

/** A UTC day as the timeline writes it: "SEP 18". */
export function dayText(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at
    .toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' })
    .toUpperCase();
}

/** A GeoJSON geometry (`Geometry`). */
type Geometry = components['schemas']['Geometry'];

/**
 * An investigation's footprint, from its items' snapshots: each snapshot's `geometry`, and the box
 * around all of their positions (undefined when no item has one).
 */
export function itemsArea(items: readonly InvestigationItem[]): {
  geometries: Geometry[];
  bbox?: [number, number, number, number];
} {
  const geometries: Geometry[] = [];
  let box: [number, number, number, number] | undefined;
  const add = (lon: number, lat: number) => {
    box = box
      ? [Math.min(box[0], lon), Math.min(box[1], lat), Math.max(box[2], lon), Math.max(box[3], lat)]
      : [lon, lat, lon, lat];
  };
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      add(value[0], value[1]);
      return;
    }
    value.forEach(walk);
  };
  for (const item of items) {
    const geometry = item.snapshot?.['geometry'] as Geometry | null | undefined;
    if (!geometry || typeof geometry !== 'object' || typeof geometry.type !== 'string') continue;
    geometries.push(geometry);
    walk(geometry.coordinates);
  }
  return { geometries, ...(box && { bbox: box }) };
}

/** An investigation's items as timeline rows, newest first, by when each was added. */
export function itemRows(items: readonly InvestigationItem[]): TimelineRow[] {
  return items
    .map((item): TimelineRow => ({
      key: item.id,
      at: item.addedAt,
      title: itemTitle(item),
      tag: item.itemType,
      ref: itemRef(item),
    }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The member kinds' categories, in the rail's order, each once. */
export function memberCategories(kinds: readonly string[]): CategoryId[] {
  const present = new Set(kinds.map(categoryOf));
  return KIND_CATEGORIES.map((category) => category.id).filter((id) => present.has(id));
}
