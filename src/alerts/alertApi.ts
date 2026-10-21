import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** An alert with its lifecycle (`Alert`). */
export type Alert = components['schemas']['Alert'];

/** An alert lifecycle event on `streamAlerts` (`AlertEvent`). */
export type AlertEvent = components['schemas']['AlertEvent'];

/** Alert-quality feedback, as the backend names it. */
export type AlertFeedback = NonNullable<Alert['feedback']>;

/** An inbox item with per-device read state (`Notification`). */
export type InboxItem = components['schemas']['Notification'];

/** An inbox item with its links and action capabilities (`NotificationDetail`). */
export type InboxDetail = components['schemas']['NotificationDetail'];

/** Unread counts for this device (`NotificationBadge`). */
export type Badge = components['schemas']['NotificationBadge'];

/** A presence state the backend takes (`ClientPresenceInput.state`). */
export type PresenceState = components['schemas']['ClientPresenceInput']['state'];

/** How many open alerts are read when the page opens. */
export const OPEN_ALERTS_LIMIT = 50;

/** How many inbox items a page holds. */
export const INBOX_PAGE = 50;

/** The open alerts (firing or acknowledged), newest first (`listAlerts`). */
export async function listOpenAlerts(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<Alert[]> {
  const page = await unwrap(
    api.GET('/v1/alerts', {
      params: { query: { state: ['firing', 'acknowledged'], limit: OPEN_ALERTS_LIMIT } },
      signal,
    }),
  );
  return page.items;
}

/** One alert with its lifecycle (`getAlert`). */
export function getAlert(api: ForesignalClient, id: number, signal?: AbortSignal): Promise<Alert> {
  return unwrap(api.GET('/v1/alerts/{alertId}', { params: { path: { alertId: id } }, signal }));
}

/** Acknowledges an alert (`acknowledgeAlert`); idempotent. */
export function acknowledgeAlert(api: ForesignalClient, id: number): Promise<Alert> {
  return unwrap(
    api.POST('/v1/alerts/{alertId}/ack', { params: { path: { alertId: id } }, body: {} }),
  );
}

/** Snoozes an alert for a duration such as `1h` (`snoozeAlert`). */
export function snoozeAlert(api: ForesignalClient, id: number, duration: string): Promise<Alert> {
  return unwrap(
    api.POST('/v1/alerts/{alertId}/snooze', {
      params: { path: { alertId: id } },
      body: { for: duration },
    }),
  );
}

/** Clears an alert's snooze (`unsnoozeAlert`); idempotent. */
export function unsnoozeAlert(api: ForesignalClient, id: number): Promise<Alert> {
  return unwrap(api.DELETE('/v1/alerts/{alertId}/snooze', { params: { path: { alertId: id } } }));
}

/** Resolves an alert (`resolveAlert`); terminal and idempotent. */
export function resolveAlert(api: ForesignalClient, id: number): Promise<Alert> {
  return unwrap(
    api.POST('/v1/alerts/{alertId}/resolve', { params: { path: { alertId: id } }, body: {} }),
  );
}

/** Records feedback on an alert in any state (`setAlertFeedback`). */
export function setAlertFeedback(
  api: ForesignalClient,
  id: number,
  feedback: AlertFeedback,
): Promise<Alert> {
  return unwrap(
    api.PUT('/v1/alerts/{alertId}/feedback', {
      params: { path: { alertId: id } },
      body: { feedback },
    }),
  );
}

/** One page of this device's inbox, newest first (`listNotifications`). */
export function listInbox(
  api: ForesignalClient,
  cursor?: string,
  signal?: AbortSignal,
): Promise<components['schemas']['NotificationPage']> {
  return unwrap(
    api.GET('/v1/notifications', {
      params: { query: { limit: INBOX_PAGE, ...(cursor && { cursor }) } },
      signal,
    }),
  );
}

/** One inbox item with its links and actions for this device (`getNotification`). */
export function getInboxItem(
  api: ForesignalClient,
  id: number,
  signal?: AbortSignal,
): Promise<InboxDetail> {
  return unwrap(
    api.GET('/v1/notifications/{notificationId}', {
      params: { path: { notificationId: id } },
      signal,
    }),
  );
}

/** This device's unread counts (`getNotificationBadge`). */
export function getBadge(api: ForesignalClient, signal?: AbortSignal): Promise<Badge> {
  return unwrap(api.GET('/v1/notifications/badge', { signal }));
}

/**
 * Marks inbox items read on this device (`markNotificationsRead`): everything up to an id, or
 * the given ids. Reading never acknowledges an alert. Answers the new badge.
 */
export function markRead(
  api: ForesignalClient,
  read: { upToId: number } | { ids: number[] },
): Promise<Badge> {
  return unwrap(api.POST('/v1/notifications/read', { body: read }));
}

/** Reports this device's presence (`updatePresence`), as a web client. */
export function updatePresence(
  api: ForesignalClient,
  state: PresenceState,
  ttlSeconds: number,
): Promise<components['schemas']['ClientPresence']> {
  return unwrap(api.POST('/v1/clients/presence', { body: { kind: 'web', state, ttlSeconds } }));
}
