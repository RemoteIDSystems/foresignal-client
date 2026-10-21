import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** A rule as written (`TriggerRuleInput`). */
export type TriggerRuleInput = components['schemas']['TriggerRuleInput'];

/** A stored rule with its counters and state (`TriggerRule`). */
export type TriggerRule = components['schemas']['TriggerRule'];

/** A dry run's result (`TriggerTestResult`). */
export type TriggerTestResult = components['schemas']['TriggerTestResult'];

/** The per-group state of a windowed rule (`WindowStateList`). */
export type WindowStateList = components['schemas']['WindowStateList'];

/** An anomaly rule's learned baseline (`AnomalyBaseline`). */
export type AnomalyBaseline = components['schemas']['AnomalyBaseline'];

/** One rule's tuning suggestions (`TuningSuggestionList`). */
export type TuningSuggestionList = components['schemas']['TuningSuggestionList'];

/** One tuning suggestion with its status (`TuningSuggestionRecord`). */
export type TuningSuggestionRecord = components['schemas']['TuningSuggestionRecord'];

/** A page of applied tuning changes (`TuningLogPage`). */
export type TuningLogPage = components['schemas']['TuningLogPage'];

/** A payload condition (`Condition`). */
export type Condition = components['schemas']['Condition'];

/** A delivery channel (`Channel`). */
export type Channel = components['schemas']['Channel'];

/** A channel type with its fields (`ChannelType`). */
export type ChannelType = components['schemas']['ChannelType'];

/** A channel test's result (`ChannelTestResult`). */
export type ChannelTestResult = components['schemas']['ChannelTestResult'];

/** One kind with its sources and current count (`KindSummary`). */
export type KindSummary = components['schemas']['KindSummary'];

/** A watchlist (`Watchlist`). */
export type Watchlist = components['schemas']['Watchlist'];

/** How far back a dry run looks, and how many matches it returns. */
export interface DryRunQuery {
  /** Start of the backtest (`since`). */
  since: string;
  /** End of the backtest (`until`); now when absent. */
  until?: string;
  /** Most matches returned. */
  limit?: number;
}

/** Every rule (`listTriggers`). */
export function listTriggers(api: ForesignalClient, signal?: AbortSignal): Promise<TriggerRule[]> {
  return unwrap(api.GET('/v1/triggers', { signal }));
}

/** One rule (`getTrigger`). */
export function getTrigger(
  api: ForesignalClient,
  ruleId: string,
  signal?: AbortSignal,
): Promise<TriggerRule> {
  return unwrap(api.GET('/v1/triggers/{ruleId}', { params: { path: { ruleId } }, signal }));
}

/** Creates a rule (`createTrigger`); needs `agent` scope. */
export function createTrigger(api: ForesignalClient, rule: TriggerRuleInput): Promise<TriggerRule> {
  return unwrap(api.POST('/v1/triggers', { body: rule }));
}

/** Replaces a rule whole (`updateTrigger`). */
export function updateTrigger(
  api: ForesignalClient,
  ruleId: string,
  rule: TriggerRuleInput,
): Promise<TriggerRule> {
  return unwrap(api.PUT('/v1/triggers/{ruleId}', { params: { path: { ruleId } }, body: rule }));
}

/** Deletes a rule; its alerts are kept (`deleteTrigger`). */
export async function deleteTrigger(api: ForesignalClient, ruleId: string): Promise<void> {
  await unwrap(api.DELETE('/v1/triggers/{ruleId}', { params: { path: { ruleId } } }));
}

/**
 * Backtests a stored rule over stored versions (`testTrigger`, `simulate=true`): the matches, and
 * how many alerts it would have fired and suppressed after cooldown, snooze and the storm cap.
 * It creates nothing.
 */
export function testTrigger(
  api: ForesignalClient,
  ruleId: string,
  query: DryRunQuery,
): Promise<TriggerTestResult> {
  return unwrap(
    api.POST('/v1/triggers/{ruleId}/test', {
      params: {
        path: { ruleId },
        query: {
          since: query.since,
          ...(query.until ? { until: query.until } : {}),
          limit: query.limit ?? 100,
          simulate: true,
        },
      },
    }),
  );
}

/** Mutes a rule for a duration from 1 h to 7 d (`muteTrigger`). */
export function muteTrigger(
  api: ForesignalClient,
  ruleId: string,
  duration: string,
): Promise<TriggerRule> {
  return unwrap(
    api.POST('/v1/triggers/{ruleId}/mute', {
      params: { path: { ruleId } },
      body: { for: duration },
    }),
  );
}

/** Clears a rule's mute (`unmuteTrigger`). */
export function unmuteTrigger(api: ForesignalClient, ruleId: string): Promise<TriggerRule> {
  return unwrap(api.DELETE('/v1/triggers/{ruleId}/mute', { params: { path: { ruleId } } }));
}

/** Snoozes a rule for a duration up to 7 d (`snoozeTrigger`). */
export function snoozeTrigger(
  api: ForesignalClient,
  ruleId: string,
  duration: string,
): Promise<TriggerRule> {
  return unwrap(
    api.POST('/v1/triggers/{ruleId}/snooze', {
      params: { path: { ruleId } },
      body: { for: duration },
    }),
  );
}

/** Clears a rule's snooze (`unsnoozeTrigger`). */
export function unsnoozeTrigger(api: ForesignalClient, ruleId: string): Promise<TriggerRule> {
  return unwrap(api.DELETE('/v1/triggers/{ruleId}/snooze', { params: { path: { ruleId } } }));
}

/** Each group's state for a windowed rule (`getTriggerWindowState`). */
export function getWindowState(
  api: ForesignalClient,
  ruleId: string,
  signal?: AbortSignal,
): Promise<WindowStateList> {
  return unwrap(
    api.GET('/v1/triggers/{ruleId}/window-state', { params: { path: { ruleId } }, signal }),
  );
}

/** An anomaly rule's baseline (`getTriggerBaseline`); `409 BASELINE_NOT_READY` before a sample. */
export function getBaseline(
  api: ForesignalClient,
  ruleId: string,
  signal?: AbortSignal,
): Promise<AnomalyBaseline> {
  return unwrap(
    api.GET('/v1/triggers/{ruleId}/baseline', { params: { path: { ruleId } }, signal }),
  );
}

/** Recomputes an anomaly rule's baseline (`rebuildBaseline`). */
export async function rebuildBaseline(api: ForesignalClient, ruleId: string): Promise<void> {
  await unwrap(
    api.POST('/v1/triggers/{ruleId}/baseline/rebuild', { params: { path: { ruleId } } }),
  );
}

/** The open tuning suggestions for a rule (`getTriggerSuggestions`). */
export function getSuggestions(
  api: ForesignalClient,
  ruleId: string,
  signal?: AbortSignal,
): Promise<TuningSuggestionList> {
  return unwrap(
    api.GET('/v1/triggers/{ruleId}/suggestions', {
      params: { path: { ruleId }, query: { status: 'OPEN' } },
      signal,
    }),
  );
}

/** Applies a suggestion's patch through the backend's update path (`applyTuningSuggestion`). */
export async function applySuggestion(
  api: ForesignalClient,
  ruleId: string,
  suggestionId: string,
): Promise<void> {
  await unwrap(
    api.POST('/v1/triggers/{ruleId}/suggestions/{suggestionId}/apply', {
      params: { path: { ruleId, suggestionId } },
      body: {},
    }),
  );
}

/** The applied tuning changes, newest first (`listTuningLog`). */
export function listTuningLog(
  api: ForesignalClient,
  ruleId: string,
  signal?: AbortSignal,
): Promise<TuningLogPage> {
  return unwrap(
    api.GET('/v1/triggers/{ruleId}/tuning-log', {
      params: { path: { ruleId }, query: { limit: 20 } },
      signal,
    }),
  );
}

/** The delivery channels (`listChannels`); needs `admin` scope. */
export function listChannels(api: ForesignalClient, signal?: AbortSignal): Promise<Channel[]> {
  return unwrap(api.GET('/v1/channels', { signal }));
}

/** The channel types (`listChannelTypes`); needs `admin` scope. */
export function listChannelTypes(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<ChannelType[]> {
  return unwrap(api.GET('/v1/channels/types', { signal }));
}

/** Sends a test message through a channel (`testChannel`). */
export function testChannel(api: ForesignalClient, channelId: string): Promise<ChannelTestResult> {
  return unwrap(api.POST('/v1/channels/{channelId}/test', { params: { path: { channelId } } }));
}

/** The kinds with their sources (`listKinds`), for the kind and source suggestions. */
export function listKinds(api: ForesignalClient, signal?: AbortSignal): Promise<KindSummary[]> {
  return unwrap(api.GET('/v1/kinds', { signal }));
}

/** The caller's watchlists (`listWatchlists`); needs a token. */
export async function listWatchlists(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<Watchlist[]> {
  const page = await unwrap(
    api.GET('/v1/watchlists', { params: { query: { limit: 200 } }, signal }),
  );
  return page.items;
}

/** The name a dry run's temporary copy carries. */
export function dryRunName(name: string): string {
  return `${name} (dry run)`.slice(0, 200);
}

/**
 * Dry-runs a rule that may not be saved yet. `testTrigger` backtests stored rules only, so a
 * disabled copy is created (it never fires), tested, and deleted. The rule itself is not changed.
 */
export async function dryRunRule(
  api: ForesignalClient,
  rule: TriggerRuleInput,
  query: DryRunQuery,
): Promise<TriggerTestResult> {
  const copy = await createTrigger(api, { ...rule, name: dryRunName(rule.name), enabled: false });
  try {
    return await testTrigger(api, copy.id, query);
  } finally {
    await deleteTrigger(api, copy.id).catch((error: unknown) => {
      console.warn(`ForeSignal: the dry-run copy ${copy.id} was not deleted.`, error);
    });
  }
}
