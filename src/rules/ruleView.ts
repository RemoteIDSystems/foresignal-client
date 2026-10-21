import type { SlotSeries } from '../ui/charts/chartOptions';
import { stillUntil } from './ruleDraft';
import type { AnomalyBaseline, Channel, TriggerRule } from './triggerApi';

/** How many groups a baseline chart draws. */
export const BASELINE_GROUPS = 4;

/** A rule's mute duration when muted from the list (the backend takes 1 h to 7 d). */
export const MUTE_FOR = '4h';

/** A rule's snooze duration when snoozed from the list (the backend takes up to 7 d). */
export const RULE_SNOOZE_FOR = '1h';

/** The learned mean per slot of the first {@link BASELINE_GROUPS} groups, slot order. */
export function baselineSeries(baseline: AnomalyBaseline): SlotSeries[] {
  const groups = new Map<string, [number, number][]>();
  for (const slot of baseline.slots) {
    const points = groups.get(slot.groupKey) ?? [];
    points.push([slot.slot, slot.mean]);
    groups.set(slot.groupKey, points);
  }
  return [...groups.entries()].slice(0, BASELINE_GROUPS).map(([name, points]) => ({
    name: name || 'All',
    points: points.sort((a, b) => a[0] - b[0]),
  }));
}

/**
 * The enabled channels configured to deliver a rule's alerts: they take `alert` events and name
 * the rule, or name no rules (all of them). Their severity floor is shown, not applied.
 */
export function channelsForRule(channels: readonly Channel[], rule: TriggerRule): Channel[] {
  return channels.filter(
    (channel) =>
      channel.enabled &&
      channel.events.includes('alert') &&
      (channel.ruleIds === null ||
        channel.ruleIds === undefined ||
        channel.ruleIds.includes(rule.id)),
  );
}

/** A rule's status words: disabled, muted, snoozed, or the backend's last error. */
export function ruleStatus(rule: TriggerRule, now: number): string[] {
  const words: string[] = [];
  if (!rule.enabled) words.push('disabled');
  if (stillUntil(rule.mutedUntil, now)) words.push('muted');
  if (stillUntil(rule.snoozedUntil, now)) words.push('snoozed');
  if (rule.lastError) words.push('error');
  return words;
}

/** A windowed rule's group counts by state, as `3 groups: 1 active, 2 clear`. */
export function windowText(status: NonNullable<TriggerRule['windowStatus']>): string {
  const parts = (['active', 'clear', 'learning', 'unknown'] as const)
    .filter((state) => status.states[state])
    .map((state) => `${status.states[state]} ${state}`);
  const groups = `${status.groups} ${status.groups === 1 ? 'group' : 'groups'}`;
  return parts.length ? `${groups}: ${parts.join(', ')}` : groups;
}
