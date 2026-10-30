import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/**
 * One of the calling principal's notification preferences (`listMyNotificationPreferences`,
 * `GET /v1/me/notification-preferences`): the `eventTypes` it fires on, the owned `channel` it
 * delivers through, optional `quietHours`, and whether it is `enabled`.
 */
export type NotificationPreference = components['schemas']['NotificationPreference'];

/** One preference as the replace call accepts it (`NotificationPreferenceInput`). */
export type NotificationPreferenceInput = components['schemas']['NotificationPreferenceInput'];

/** The event types a notification preference may fire on. */
export type NotificationEventType = NotificationPreference['eventTypes'][number];

/** Every event type the contract defines, in a stable order for the editor. */
export const NOTIFICATION_EVENT_TYPES: readonly NotificationEventType[] = [
  'mention',
  'share',
  'report',
  'chronicle',
  'assessment',
  'comment-reply',
];

/** Lists the calling principal's notification preferences. */
export function listMyNotificationPreferences(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<NotificationPreference[]> {
  return unwrap(api.GET('/v1/me/notification-preferences', { signal }));
}

/** Replaces the calling principal's notification preferences and returns the stored result. */
export function replaceMyNotificationPreferences(
  api: ForesignalClient,
  items: NotificationPreferenceInput[],
): Promise<NotificationPreference[]> {
  return unwrap(api.PUT('/v1/me/notification-preferences', { body: { items } }));
}

/**
 * Turns a stored preference into the input the replace call wants: keeps its id so the backend
 * updates it in place, carries the channel's type, config and language forward, and omits
 * write-only `secrets` so stored secrets are kept. Read-only fields (`channelId`, `secretFields`,
 * timestamps) are dropped.
 */
export function toInput(pref: NotificationPreference): NotificationPreferenceInput {
  return {
    id: pref.id,
    eventTypes: pref.eventTypes,
    channel: {
      type: pref.channel.type,
      config: pref.channel.config,
      language: pref.channel.language,
    },
    quietHours: pref.quietHours,
    enabled: pref.enabled,
  };
}
