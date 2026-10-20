import { prettifyId } from '../lib/labels';
import type { Dossier, ObjectAction, ObjectEnvelope, SectionStatus } from './objectApi';

/** One labeled value in the panel's key fields. */
export interface Fact {
  label: string;
  value: string;
}

/** Overview fields that are not key facts: identity, bookkeeping and links. */
const NOT_FACTS = new Set([
  'title',
  'kind',
  'version',
  'code',
  'ids',
  'sources',
  'types',
  'type',
  'net',
  'detail',
  'url',
  'status',
  'updated',
  'time',
]);

/** How many overview fields join the key facts, as in the mock's six-row column. */
export const KEY_FIELDS = 3;

/** A latitude and longitude as the mock writes them: `28.4°N, 76.5°W`. */
export function formatLatLon(longitude: number, latitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(1)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(1)}°${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}

/** An instant as the panel shows it, in UTC to the minute: `2025-09-18 14:00Z`. */
export function formatPanelTime(at: string | number): string {
  const iso = new Date(at).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`;
}

/** A field value as text: numbers to at most three decimals; other scalars as they are. */
export function formatValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  }
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return undefined;
}

/** A field name as a label: `maxWind` and `max_wind` both read `Max Wind`. */
export function fieldLabel(key: string): string {
  return prettifyId(key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase());
}

/** The overview's scalar fields as facts, in the backend's order, links and bookkeeping left out. */
export function fieldFacts(fields: Record<string, unknown> | undefined): Fact[] {
  const facts: Fact[] = [];
  for (const [key, raw] of Object.entries(fields ?? {})) {
    if (NOT_FACTS.has(key)) continue;
    if (typeof raw === 'string' && /^https?:\/\//i.test(raw)) continue;
    const value = formatValue(raw);
    if (value !== undefined) facts.push({ label: fieldLabel(key), value });
  }
  return facts;
}

/** The point an envelope sits at: its point geometry, else its bbox's center. */
export function envelopePoint(envelope: ObjectEnvelope): [number, number] | undefined {
  const geometry = envelope.geometry as { type?: string; coordinates?: unknown } | null | undefined;
  if (geometry?.type === 'Point' && Array.isArray(geometry.coordinates)) {
    const [lon, lat] = geometry.coordinates as number[];
    if (typeof lon === 'number' && typeof lat === 'number') return [lon, lat];
  }
  const [west, south, east, north] = envelope.bbox ?? [];
  if (west === undefined || south === undefined || east === undefined || north === undefined) {
    return undefined;
  }
  return [(west + east) / 2, (south + north) / 2];
}

/**
 * The panel's key facts, after the mock's column: the type, the first {@link KEY_FIELDS} overview
 * fields, the location and the last update. The rest of the fields are listed under them.
 */
export function keyFacts(
  dossier: Dossier,
  kindLabel: string | undefined,
): { key: Fact[]; more: Fact[] } {
  const { envelope, sections } = dossier;
  const fields = fieldFacts(
    sections.overview?.status === 'ok' ? sections.overview.fields : undefined,
  );
  const key: Fact[] = [];
  if (kindLabel) key.push({ label: 'Type', value: kindLabel });
  key.push(...fields.slice(0, KEY_FIELDS));
  const point = envelopePoint(envelope);
  if (point) key.push({ label: 'Location', value: formatLatLon(point[0], point[1]) });
  const updated = envelope.time?.observedAt ?? envelope.time?.start;
  if (updated) key.push({ label: 'Last Update', value: formatPanelTime(updated) });
  return { key, more: fields.slice(KEY_FIELDS) };
}

/** What a section that has nothing to render says, by its status. */
export function sectionMessage(
  status: SectionStatus,
  name: string,
  message?: string | null,
): string | undefined {
  if (status === 'ok') return undefined;
  if (message) return message;
  switch (status) {
    case 'empty':
      return `No ${name.toLowerCase()} for this object.`;
    case 'unavailable':
      return `${name} is unavailable right now.`;
    case 'not-installed':
      return `${name} is not installed on this server.`;
  }
}

/** How many related objects the dossier lists, across its groups. */
export function relatedCount(dossier: Dossier): number {
  const related = dossier.sections.related;
  if (related?.status !== 'ok') return 0;
  return (
    (related.nearby?.length ?? 0) +
    (related.operational?.length ?? 0) +
    (related.infrastructure?.length ?? 0) +
    (related.historical?.length ?? 0)
  );
}

/** Actions shown as buttons beside the image; the rest go in the `…` overflow. */
export const SHOWN_ACTIONS = 2;

/** An action's button label: its own, else its id made readable. */
export function actionLabel(action: ObjectAction): string {
  return action.label ?? prettifyId(action.id);
}

/** The badge tone for an envelope's status. */
export function statusTone(status: string | null | undefined): 'success' | 'neutral' | 'warning' {
  if (!status) return 'neutral';
  if (/^(active|live|open|ongoing)$/i.test(status)) return 'success';
  if (/^(warning|watch|alert)$/i.test(status)) return 'warning';
  return 'neutral';
}
