import {
  bboxGeofence,
  conditionValue,
  draftOf,
  draftProblems,
  newDraft,
  regionGeofence,
  regionScope,
  scopeLabel,
  storedInput,
  toRuleInput,
  viewportScope,
  watchlistScope,
} from './ruleDraft';
import { storedRule } from './testing/ruleFixtures';

describe('rule scopes', () => {
  it('prefills from the map view, a situation and a watchlist', () => {
    expect(viewportScope({ bbox: [10, 20, 30, 40], zoom: 4 })).toEqual({
      kind: 'viewport',
      bbox: [10, 20, 30, 40],
    });
    expect(viewportScope(undefined)).toEqual({ kind: 'everywhere' });
    expect(regionScope(['RU', 'PL', 'ZZ'], 'Russia–NATO')).toEqual({
      kind: 'region',
      codes: ['RU', 'PL'],
      label: 'Russia–NATO',
    });
    expect(regionScope(['ZZ'], 'Untagged')).toEqual({ kind: 'everywhere' });
    expect(scopeLabel(watchlistScope('wl-1', 'Vessels'))).toBe('Watchlist Vessels');
  });

  it('writes a map view as a polygon, split in two across the antimeridian', () => {
    expect(bboxGeofence([10, 20, 30, 40])).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [10, 20],
          [30, 20],
          [30, 40],
          [10, 40],
          [10, 20],
        ],
      ],
    });
    const split = bboxGeofence([170, -10, -170, 10]);
    expect(split.type).toBe('MultiPolygon');
    expect(split.coordinates).toHaveLength(2);
  });

  it('writes region codes as a country and admin-1 preset', () => {
    expect(regionGeofence(['RU', 'US-TX', 'PL'])).toEqual({
      country: ['RU', 'PL'],
      admin1: ['US-TX'],
    });
  });
});

describe('condition values', () => {
  it('types each value as its operator takes it', () => {
    expect(conditionValue('>=', ' 5.5 ')).toBe(5.5);
    expect(conditionValue('==', 'true')).toBe(true);
    expect(conditionValue('==', 'M5')).toBe('M5');
    expect(conditionValue('==', '7')).toBe(7);
    expect(conditionValue('in', '1, 2, 3')).toEqual([1, 2, 3]);
    expect(conditionValue('in', 'RU, 2')).toEqual(['RU', '2']);
    expect(conditionValue('exists', '')).toBe(true);
    expect(conditionValue('exists', 'false')).toBe(false);
    expect(conditionValue('startsWith', ' MIL ')).toBe('MIL');
  });
});

describe('draft problems', () => {
  it('names what keeps a draft from being sent', () => {
    const draft = {
      ...newDraft({ kind: 'region', codes: ['russia'], label: 'Regions' }),
      conditions: [{ path: '', op: '>' as const, value: 'big' }],
      type: 'count' as const,
      threshold: 'many',
    };
    expect(draftProblems(draft)).toEqual([
      'Name the rule.',
      'Condition 1 needs a field path.',
      'Condition 1 compares with >, which takes a number.',
      'Not region codes: russia.',
      'Give the count threshold as a whole number.',
    ]);
    expect(draftProblems({ ...newDraft(), name: 'Fine' })).toEqual([]);
  });
});

describe('building the rule', () => {
  it('builds a scoped threshold rule, ANDing the conditions', () => {
    const draft = {
      ...newDraft(regionScope(['RU', 'PL', 'EE'], 'Russia–NATO'), 'Russia–NATO watch'),
      kinds: 'military-flight, naval',
      sources: '',
      severity: 'critical' as const,
      conditions: [{ path: 'altitude', op: '<' as const, value: '3000' }],
      enrich: true,
      activeDays: ['MON' as const, 'FRI' as const],
      timezone: 'UTC',
    };
    const rule = toRuleInput(draft);
    expect(rule).toMatchObject({
      name: 'Russia–NATO watch',
      enabled: true,
      severity: 'critical',
      type: 'record',
      mode: 'match',
      kinds: ['military-flight', 'naval'],
      sources: [],
      conditions: [{ path: 'altitude', op: '<', value: 3000 }],
      geofenceRef: { country: ['RU', 'PL', 'EE'] },
      geofence: null,
      enrich: true,
      cooldown: '1h',
      activeWindow: {
        timezone: 'UTC',
        windows: [{ days: ['MON', 'FRI'], start: '08:00', end: '18:00' }],
      },
      window: null,
    });
  });

  it('scopes a watchlist with an inWatchlist condition', () => {
    const rule = toRuleInput({ ...newDraft(watchlistScope('wl-1', 'Vessels')), name: 'Ships' });
    expect(rule.conditions).toEqual([{ op: 'inWatchlist', value: 'wl-1' }]);
  });

  it('leaves mode and onlyNew out of a windowed rule, which refuses them', () => {
    const rule = toRuleInput({
      ...newDraft(),
      name: 'Bursts',
      type: 'count',
      window: '6h',
      countOp: '>=',
      threshold: '10',
      groupBy: 'country',
    });
    expect(rule).not.toHaveProperty('mode');
    expect(rule).not.toHaveProperty('onlyNew');
    expect(rule.window).toEqual({
      window: '6h',
      distinctBy: 'entity',
      maxGroups: 500,
      groupBy: 'country',
      op: '>=',
      threshold: 10,
    });
  });

  it('keeps what the form does not show when editing, and drops what the backend writes', () => {
    const stored = storedRule({
      escalationPolicyId: 'policy-1',
      maxAlertsPerHour: 20,
      mutedUntil: '2099-01-01T00:00:00Z',
      kind: 'earthquake',
    });
    const rule = toRuleInput({ ...draftOf(stored), severity: 'critical' }, stored);
    expect(rule).toMatchObject({ escalationPolicyId: 'policy-1', maxAlertsPerHour: 20 });
    for (const field of ['id', 'createdAt', 'alertCount', 'mutedUntil', 'kind', 'lastFiredAt'])
      expect(rule).not.toHaveProperty(field);
    expect(rule.severity).toBe('critical');
    expect(storedInput(stored)).not.toHaveProperty('openAlertCount');
  });

  it('reads a stored rule back into the form', () => {
    const viewport = storedRule({
      geofence: bboxGeofence([10, 20, 30, 40]),
      conditions: [
        { path: 'mag', op: 'in', value: [5, 6] },
        { op: 'inWatchlist', value: 'wl-9' },
      ],
    });
    const draft = draftOf(viewport);
    expect(draft.scope).toEqual({ kind: 'watchlist', id: 'wl-9', label: 'wl-9' });
    expect(draft.conditions).toEqual([{ path: 'mag', op: 'in', value: '5, 6' }]);
    expect(draftOf(storedRule({ geofence: bboxGeofence([10, 20, 30, 40]) })).scope).toEqual({
      kind: 'viewport',
      bbox: [10, 20, 30, 40],
    });
    expect(draftOf(storedRule({ geofence: bboxGeofence([170, -10, -170, 10]) })).scope).toEqual({
      kind: 'viewport',
      bbox: [170, -10, -170, 10],
    });
    expect(draftOf(storedRule({ geofenceRef: { country: ['RU'] } })).scope).toMatchObject({
      kind: 'region',
      codes: ['RU'],
    });
    const corridor = storedRule({
      geofence: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      bufferMeters: 500,
    });
    expect(draftOf(corridor).scope.kind).toBe('kept');
    // A shape the form does not draw is sent back as stored.
    expect(toRuleInput(draftOf(corridor), corridor)).toMatchObject({
      geofence: corridor.geofence,
      bufferMeters: 500,
    });
  });
});
