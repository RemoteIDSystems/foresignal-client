import type { components } from '../api/generated/schema';
import { splitAtAntimeridian, type CommittedViewport } from '../state/viewport';
import type { Condition, TriggerRule, TriggerRuleInput } from './triggerApi';

/** A rule's severity, as the backend names it. */
export type RuleSeverity = TriggerRuleInput['severity'];

/** A rule's type, as the backend names it. */
export type RuleType = TriggerRuleInput['type'];

/** A condition operator, as the backend names it. */
export type ConditionOp = Condition['op'];

/** A weekday as an active window names it. */
export type Weekday = components['schemas']['ActiveWindow']['windows'][number]['days'][number];

/** Where a rule watches. */
export type RuleScope =
  | { kind: 'everywhere' }
  | { kind: 'viewport'; bbox: CommittedViewport['bbox'] }
  | { kind: 'region'; codes: string[]; label: string }
  | { kind: 'watchlist'; id: string; label: string }
  /** A geofence the form does not draw (a line, a `near` anchor), kept as the rule has it. */
  | { kind: 'kept'; label: string };

/** One condition as the form holds it: the value is text until the rule is built. */
export interface ConditionDraft {
  path: string;
  op: ConditionOp;
  value: string;
}

/** The rule form's state. Text fields hold what the user typed; {@link toRuleInput} reads them. */
export interface RuleDraft {
  name: string;
  severity: RuleSeverity;
  type: RuleType;
  /** Comma-separated kinds. */
  kinds: string;
  /** Comma-separated source ids. */
  sources: string;
  conditions: ConditionDraft[];
  scope: RuleScope;
  /** Record rules only. */
  mode: 'match' | 'enter' | 'exit';
  /** Shorthand or ISO-8601 duration; empty for none. */
  cooldown: string;
  /** Windowed rules: the window length. */
  window: string;
  /** Count rules: the comparison and threshold. */
  countOp: '>=' | '<=';
  threshold: string;
  /** Windowed rules: `null` (empty), `source`, `country`, `admin1`, … */
  groupBy: string;
  /** Anomaly rules. */
  direction: 'up' | 'down' | 'both';
  sensitivity: 'low' | 'medium' | 'high';
  enrich: boolean;
  /** The active window: no days means always active. */
  activeDays: Weekday[];
  activeStart: string;
  activeEnd: string;
  timezone: string;
  /** Rule tags, comma-separated. */
  tags: string;
}

/** The operators the form offers, in the backend's order. */
export const CONDITION_OPS: readonly ConditionOp[] = [
  '>',
  '>=',
  '<',
  '<=',
  '==',
  '!=',
  'in',
  'notIn',
  'exists',
  'startsWith',
  'matches',
];

/** The rule types, as the backend names them. */
export const RULE_TYPES: readonly RuleType[] = ['record', 'count', 'absence', 'anomaly'];

/** The severities, as the backend names them. */
export const SEVERITIES: readonly RuleSeverity[] = ['info', 'warning', 'critical'];

/** The weekdays, as an active window names them. */
export const WEEKDAYS: readonly Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** The windowed types, which take a window and refuse `mode` and `onlyNew`. */
export function isWindowed(type: RuleType): boolean {
  return type !== 'record';
}

/** Fields only the backend writes; they are dropped before a rule is sent back. */
const SERVER_FIELDS = [
  'id',
  'createdAt',
  'updatedAt',
  'lastFiredAt',
  'alertCount',
  'lastError',
  'lastErrorAt',
  'openAlertCount',
  'suppressedCount',
  'lastStormAt',
  'feedbackCounts',
  'snoozedUntil',
  'geofenceRoute',
  'mutedUntil',
  'geofenceOrigin',
  'anchorStatus',
  'windowStatus',
  // Deprecated aliases of `sources` and `kinds`: giving both is refused.
  'source',
  'kind',
] as const;

/** A new rule's form, watching `scope`. */
export function newDraft(scope: RuleScope = { kind: 'everywhere' }, name = ''): RuleDraft {
  return {
    name,
    severity: 'warning',
    type: 'record',
    kinds: '',
    sources: '',
    conditions: [],
    scope,
    mode: 'match',
    cooldown: '1h',
    window: '1h',
    countOp: '>=',
    threshold: '5',
    groupBy: '',
    direction: 'up',
    sensitivity: 'medium',
    enrich: false,
    activeDays: [],
    activeStart: '08:00',
    activeEnd: '18:00',
    timezone: browserTimezone(),
    tags: '',
  };
}

/** The scope for the last committed map view. */
export function viewportScope(viewport: CommittedViewport | undefined): RuleScope {
  return viewport ? { kind: 'viewport', bbox: viewport.bbox } : { kind: 'everywhere' };
}

/** The scope for a situation's regions; `ZZ` (untagged) is left out. */
export function regionScope(codes: readonly string[], label: string): RuleScope {
  const kept = codes.filter((code) => code !== 'ZZ');
  return kept.length ? { kind: 'region', codes: kept, label } : { kind: 'everywhere' };
}

/** The scope for a watchlist's members. */
export function watchlistScope(id: string, label: string): RuleScope {
  return { kind: 'watchlist', id, label };
}

/** A short description of a scope. */
export function scopeLabel(scope: RuleScope): string {
  switch (scope.kind) {
    case 'everywhere':
      return 'Everywhere';
    case 'viewport':
      return `Map view ${scope.bbox.map((value) => value.toFixed(2)).join(', ')}`;
    case 'region':
      return `${scope.label} (${scope.codes.join(', ')})`;
    case 'watchlist':
      return `Watchlist ${scope.label}`;
    case 'kept':
      return scope.label;
  }
}

/** A comma-separated list as its trimmed, non-empty entries. */
export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** One typed value: a number when it reads as one, a boolean for `true`/`false`, else text. */
function scalar(text: string): number | string | boolean {
  const trimmed = text.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

/** A condition's value as the operator takes it. */
export function conditionValue(op: ConditionOp, text: string): Condition['value'] {
  switch (op) {
    case '>':
    case '>=':
    case '<':
    case '<=':
      return Number(text.trim());
    case '==':
    case '!=':
      return scalar(text);
    case 'in':
    case 'notIn': {
      const items = splitList(text);
      // The backend takes a homogeneous array: all numbers, or all text.
      const numbers = items.map(Number);
      return numbers.every(Number.isFinite) ? numbers : items;
    }
    case 'exists':
      return text.trim() !== 'false';
    default:
      return text.trim();
  }
}

/** A condition's value as text for the form. */
function conditionText(value: Condition['value']): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

/** The geofence for a map view: a polygon, or two when the view crosses the antimeridian. */
export function bboxGeofence(bbox: CommittedViewport['bbox']): components['schemas']['Geometry'] {
  const rings = splitAtAntimeridian(bbox).map(([west, south, east, north]) => [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ]);
  return rings.length === 1
    ? { type: 'Polygon', coordinates: rings[0]! }
    : { type: 'MultiPolygon', coordinates: rings };
}

/** The region preset for 040 region codes: `CC` is a country, `CC-…` an admin-1 region. */
export function regionGeofence(codes: readonly string[]): components['schemas']['GeofenceRef'] {
  const country = codes.filter((code) => /^[A-Z]{2}$/.test(code));
  const admin1 = codes.filter((code) => code.includes('-'));
  return { ...(country.length ? { country } : {}), ...(admin1.length ? { admin1 } : {}) };
}

/** Problems that keep a draft from being sent; empty when it can be. */
export function draftProblems(draft: RuleDraft): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push('Name the rule.');
  for (const [index, condition] of draft.conditions.entries()) {
    const at = `Condition ${index + 1}`;
    if (!condition.path.trim()) problems.push(`${at} needs a field path.`);
    const numeric = ['>', '>=', '<', '<='].includes(condition.op);
    if (numeric && !Number.isFinite(Number(condition.value.trim())) && condition.value.trim())
      problems.push(`${at} compares with ${condition.op}, which takes a number.`);
    if (!condition.value.trim() && condition.op !== 'exists') problems.push(`${at} needs a value.`);
  }
  if (draft.scope.kind === 'region') {
    if (!draft.scope.codes.length) problems.push('Give at least one region code.');
    const bad = draft.scope.codes.filter((code) => !/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(code));
    if (bad.length) problems.push(`Not region codes: ${bad.join(', ')}.`);
  }
  if (isWindowed(draft.type) && !draft.window.trim()) problems.push('Give the window length.');
  if (draft.type === 'count' && !/^\d+$/.test(draft.threshold.trim()))
    problems.push('Give the count threshold as a whole number.');
  if (draft.activeDays.length && !(draft.activeStart && draft.activeEnd))
    problems.push('Give the active window a start and an end.');
  return problems;
}

/**
 * The rule the backend is sent for a draft. Fields the form does not show are kept from `base`
 * (the stored rule, when editing), since an update replaces the whole rule. The client only
 * writes the rule; the backend evaluates it.
 */
export function toRuleInput(
  draft: RuleDraft,
  base?: TriggerRule | TriggerRuleInput,
): TriggerRuleInput {
  const kept: Record<string, unknown> = base ? { ...storedInput(base as TriggerRule) } : {};
  const conditions: Condition[] = draft.conditions.map((condition) => ({
    path: condition.path.trim(),
    op: condition.op,
    value: conditionValue(condition.op, condition.value),
  }));
  const scope = draft.scope;
  if (scope.kind === 'watchlist') conditions.push({ op: 'inWatchlist', value: scope.id });
  const keptApproach = ((base?.conditions ?? []) as unknown[]).filter(
    (condition) => (condition as { type?: string }).type === 'approach',
  ) as NonNullable<TriggerRuleInput['conditions']>;
  const windowed = isWindowed(draft.type);
  const rule: Record<string, unknown> = {
    enabled: true,
    onlyNew: false,
    messageTemplate: '{{name}}: {{source}}/{{externalId}}',
    enrichRadiusKm: 100,
    enrichWindow: '24h',
    cooldownScope: 'record',
    autoDisableOnStorm: false,
    weatherContext: 'auto',
    ...kept,
    name: draft.name.trim(),
    severity: draft.severity,
    type: draft.type,
    mode: draft.mode,
    kinds: splitList(draft.kinds),
    sources: splitList(draft.sources),
    tags: splitList(draft.tags),
    conditions: [...conditions, ...keptApproach],
    enrich: draft.enrich,
    activeWindow: draft.activeDays.length
      ? {
          timezone: draft.timezone,
          windows: [{ days: draft.activeDays, start: draft.activeStart, end: draft.activeEnd }],
        }
      : null,
    window: windowed ? windowSpec(draft) : null,
  };
  if (draft.cooldown.trim()) rule.cooldown = draft.cooldown.trim();
  else delete rule.cooldown;
  if (scope.kind === 'viewport') {
    rule.geofence = bboxGeofence(scope.bbox);
    rule.geofenceRef = null;
    rule.near = null;
  } else if (scope.kind === 'region') {
    rule.geofenceRef = regionGeofence(scope.codes);
    rule.geofence = null;
    rule.near = null;
  } else if (scope.kind !== 'kept') {
    rule.geofence = null;
    rule.geofenceRef = null;
    rule.near = null;
  }
  if (windowed) {
    // Windowed rules refuse these (400 WINDOW_RULE_INVALID).
    delete rule.mode;
    delete rule.onlyNew;
    delete rule.reappearAsEnter;
  }
  return rule as TriggerRuleInput;
}

/** The window spec of a windowed draft. */
function windowSpec(draft: RuleDraft): TriggerRuleInput['window'] {
  const common = {
    window: draft.window.trim(),
    distinctBy: 'entity',
    maxGroups: 500,
    ...(draft.groupBy.trim() ? { groupBy: draft.groupBy.trim() } : {}),
  };
  switch (draft.type) {
    case 'count':
      return { ...common, op: draft.countOp, threshold: Number(draft.threshold.trim()) };
    case 'absence':
      return { ...common, coverageMin: 0.8 };
    default:
      return {
        ...common,
        bucket: '1h',
        slotMode: 'hour-of-week',
        direction: draft.direction,
        sensitivity: draft.sensitivity,
        minAbsoluteDelta: 3,
        minWeeks: 8,
        coverageMin: 0.8,
      };
  }
}

/** The bounds of a polygon geofence the form drew, or undefined for any other shape. */
function drawnBbox(geometry: components['schemas']['Geometry'] | null | undefined) {
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return;
  const coordinates = geometry.coordinates ?? [];
  const polygons = (geometry.type === 'Polygon' ? [coordinates] : coordinates) as number[][][][];
  const points = polygons.flat(2);
  if (!points.length) return;
  const longitudes = points.map((point) => point[0]!);
  const latitudes = points.map((point) => point[1]!);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  if (polygons.length === 2) {
    // Two boxes split at the antimeridian, as bboxGeofence writes them.
    const [first, second] = polygons.map((rings) => rings[0]!.map((point) => point[0]!));
    return [Math.min(...first!), south, Math.max(...second!), north] as CommittedViewport['bbox'];
  }
  return [
    Math.min(...longitudes),
    south,
    Math.max(...longitudes),
    north,
  ] as CommittedViewport['bbox'];
}

/** The scope a stored rule watches, as the form shows it. */
function ruleScope(rule: TriggerRule): RuleScope {
  const watch = rule.conditions?.find(
    (condition): condition is Condition =>
      'op' in condition && condition.op === 'inWatchlist' && typeof condition.value === 'string',
  );
  if (watch) return watchlistScope(watch.value as string, watch.value as string);
  if (rule.geofenceRef) {
    const codes = [...(rule.geofenceRef.country ?? []), ...(rule.geofenceRef.admin1 ?? [])];
    if (codes.length && !rule.geofenceRef.county?.length) return regionScope(codes, 'Regions');
    return { kind: 'kept', label: 'Region preset (kept as stored)' };
  }
  if (rule.near) return { kind: 'kept', label: 'Near an anchor (kept as stored)' };
  if (rule.geofence) {
    const bbox = drawnBbox(rule.geofence);
    const coordinates = (rule.geofence.coordinates ?? []) as unknown[][];
    // Only the rectangles this form draws round-trip; any other shape is kept as stored.
    const drawn =
      (rule.geofence.type === 'Polygon' && coordinates[0]?.length === 5) ||
      (rule.geofence.type === 'MultiPolygon' && coordinates.length === 2);
    return bbox && drawn
      ? { kind: 'viewport', bbox }
      : { kind: 'kept', label: 'Drawn geofence (kept as stored)' };
  }
  return { kind: 'everywhere' };
}

/** The form for a stored rule. */
export function draftOf(rule: TriggerRule): RuleDraft {
  const base = newDraft(ruleScope(rule), rule.name);
  const window = (rule.window ?? {}) as Partial<{
    window: string;
    groupBy: string | null;
    op: '>=' | '<=';
    threshold: number;
    direction: RuleDraft['direction'];
    sensitivity: RuleDraft['sensitivity'];
  }>;
  const active = rule.activeWindow?.windows[0];
  return {
    ...base,
    severity: rule.severity,
    type: rule.type,
    kinds: [...new Set([...(rule.kinds ?? []), ...(rule.kind ? [rule.kind] : [])])].join(', '),
    sources: [...new Set([...(rule.sources ?? []), ...(rule.source ? [rule.source] : [])])].join(
      ', ',
    ),
    conditions: (rule.conditions ?? [])
      .filter(
        (condition): condition is Condition =>
          'op' in condition && condition.op !== 'inWatchlist' && condition.op !== 'notInWatchlist',
      )
      .map((condition) => ({
        path: condition.path ?? '',
        op: condition.op,
        value: conditionText(condition.value),
      })),
    mode: rule.mode,
    cooldown: rule.cooldown ?? '',
    window: window.window ?? base.window,
    groupBy: window.groupBy ?? '',
    countOp: window.op ?? base.countOp,
    threshold: window.threshold !== undefined ? String(window.threshold) : base.threshold,
    direction: window.direction ?? base.direction,
    sensitivity: window.sensitivity ?? base.sensitivity,
    enrich: rule.enrich,
    activeDays: active?.days ?? [],
    activeStart: active?.start ?? base.activeStart,
    activeEnd: active?.end ?? base.activeEnd,
    timezone: rule.activeWindow?.timezone ?? base.timezone,
    tags: (rule.tags ?? []).join(', '),
  };
}

/** The browser's IANA time zone, or `UTC` when it has none. */
function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** A stored rule as an update takes it back: the backend-written fields dropped. */
export function storedInput(rule: TriggerRule): TriggerRuleInput {
  const kept: Record<string, unknown> = { ...rule };
  for (const field of SERVER_FIELDS) delete kept[field];
  return kept as TriggerRuleInput;
}

/** Whether a mute or snooze expiry is still ahead of `now`. */
export function stillUntil(until: string | null | undefined, now: number): boolean {
  return !!until && Date.parse(until) > now;
}
