import {
  Box,
  Building2,
  CircleDot,
  FileText,
  Layers,
  Lightbulb,
  MapPin,
  Siren,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { prettifyId } from '../../lib/labels';
import type { components } from '../../api/generated/schema';

/** One related object: the object, the relation that links it, its direction and distance. */
export type RelatedObject = components['schemas']['RelatedObject'];

/** The relation classes the panel's tabs show, in the mock's order. */
export const RELATED_GROUPS = ['nearby', 'operational', 'infrastructure', 'historical'] as const;

/** One of {@link RELATED_GROUPS}. */
export type RelatedGroup = (typeof RELATED_GROUPS)[number];

/** A related object's place in the four classes, by its relation's type. */
const GROUP_OF: Partial<Record<RelatedObject['relation']['type'], RelatedGroup>> = {
  near: 'nearby',
  'located-in': 'nearby',
  'depends-on': 'infrastructure',
  affects: 'infrastructure',
  precedes: 'historical',
  causes: 'historical',
  'same-as': 'historical',
  'derived-from': 'historical',
};

/**
 * The class of a related object from the flat list (`listRelatedObjects`), which the dossier's
 * related section does not need: near and located-in are Nearby; depends-on and affects are
 * Infrastructure; precedes, causes, same-as and derived-from are Historical; every other relation
 * (member-of, observed-by, evidence, about, mentions, related-to) is Operational.
 */
export function groupOf(item: RelatedObject): RelatedGroup {
  return GROUP_OF[item.relation.type] ?? 'operational';
}

/** The four classes from a flat list, each in the backend's order, Nearby nearest first. */
export function groupRelated(
  items: readonly RelatedObject[],
): Record<RelatedGroup, RelatedObject[]> {
  const groups: Record<RelatedGroup, RelatedObject[]> = {
    nearby: [],
    operational: [],
    infrastructure: [],
    historical: [],
  };
  for (const item of items) groups[groupOf(item)].push(item);
  groups.nearby.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  return groups;
}

/** A distance as the mock writes it: `45 km`, `800 m` under one kilometer. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000).toLocaleString('en-US')} m`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/**
 * The line under a related object's distance: its distance when the backend gives one, else how
 * it is related (Depends on, Precedes), with the relation's label when it is not confirmed.
 */
export function relationText(item: RelatedObject): string {
  if (item.distanceKm != null) return formatDistance(item.distanceKm);
  const label =
    item.relation.label && item.relation.label !== 'confirmed' ? item.relation.label : '';
  return [prettifyId(item.relation.type), label && `(${label})`].filter(Boolean).join(' ');
}

/** How a related object's status reads: green for running, amber for watched, red for alerts. */
export function statusLook(
  status: string | null | undefined,
  severity?: string | null,
): 'ok' | 'warn' | 'alert' | 'none' {
  if (severity && /^(severe|extreme|critical|high)$/i.test(severity)) return 'alert';
  if (!status) return 'none';
  if (/alert|closed|outage|down|failed|emergency/i.test(status)) return 'alert';
  if (/warn|watch|respond|degraded|congest|delay/i.test(status)) return 'warn';
  if (/^(active|live|open|ongoing|operational|underway|ok|normal)$/i.test(status)) return 'ok';
  return 'none';
}

/** The icon in a related object's thumbnail box, by its object type. */
export function typeIcon(type: string): LucideIcon {
  switch (type) {
    case 'record':
      return MapPin;
    case 'situation':
      return Siren;
    case 'alert':
      return TriangleAlert;
    case 'finding':
    case 'hypothesis':
      return Lightbulb;
    case 'facility':
    case 'organization':
      return Building2;
    case 'document':
    case 'report':
      return FileText;
    case 'layer':
    case 'product':
      return Layers;
    case 'entity':
      return Box;
    default:
      return CircleDot;
  }
}
