import type { Channel, TriggerRule, TriggerTestResult } from '../triggerApi';

/** A rule id the fixtures use. */
export const RULE_ID = '7b0c2c4e-0000-4000-8000-000000000001';

/** A stored record rule as the backend gives it, with `extra` laid over it. */
export function storedRule(extra: Partial<TriggerRule> = {}): TriggerRule {
  return {
    id: RULE_ID,
    name: 'Strong earthquakes near the Gulf',
    enabled: true,
    mode: 'match',
    onlyNew: false,
    messageTemplate: '{{name}}: {{source}}/{{externalId}}',
    severity: 'warning',
    enrich: false,
    enrichRadiusKm: 100,
    enrichWindow: '24h',
    cooldownScope: 'record',
    autoDisableOnStorm: false,
    weatherContext: 'auto',
    type: 'record',
    kinds: ['earthquake'],
    sources: ['usgs-earthquakes'],
    conditions: [{ path: 'mag', op: '>=', value: 5 }],
    cooldown: '1h',
    tags: [],
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    alertCount: 3,
    openAlertCount: 1,
    lastFiredAt: '2026-10-20T11:00:00Z',
    ...extra,
  };
}

/** A dry-run result with two matches. */
export function testResult(extra: Partial<TriggerTestResult> = {}): TriggerTestResult {
  return {
    ruleId: '7b0c2c4e-0000-4000-8000-0000000000dd',
    evaluatedFrom: '2026-10-19T12:00:00Z',
    matchCount: 2,
    simulated: true,
    wouldFire: 1,
    wouldSuppress: 1,
    warnings: [{ code: 'COOLDOWN_APPLIED', message: 'One match fell inside the cooldown.' }],
    matches: [1, 2].map((n) => ({
      id: `rec-${n}`,
      source: 'usgs-earthquakes',
      externalId: `us7000q${n}`,
      kind: 'earthquake',
      version: 1,
      seq: 100 + n,
      observedAt: `2026-10-20T0${n}:00:00Z`,
      payload: { mag: 5 + n / 10, place: `${n * 10} km S of Freeport` },
    })),
    ...extra,
  };
}

/** A channel as the backend lists it. */
export function channel(id: string, extra: Partial<Channel> = {}): Channel {
  return {
    id,
    name: `Channel ${id}`,
    type: 'slack',
    events: ['alert'],
    enabled: true,
    groupWindowSeconds: 0,
    backlogCap: 100,
    editInPlace: false,
    deferWhileActiveSeconds: 0,
    acceptExercise: false,
    ...extra,
  } as Channel;
}
