# 029 — Alerts And Notifications

**Goal.** Live alerts (toasts + top strip) with their lifecycle, and the per-device notification
inbox with a badge — plus desktop presence.

**Read first.** 028-CR; [Architecture.md](../docs/Architecture.md) §13. Design: the notifications
bell/badge, alert toasts, and a top alerts strip.

**Backend (OpenAPI only).**
- Alerts: `GET /v1/alerts` [`listAlerts`], `GET /v1/alerts/stream` [`streamAlerts`],
  `GET /v1/alerts/{id}` [`getAlert`]; lifecycle `POST …/ack` [`acknowledgeAlert`],
  `POST …/snooze` [`snoozeAlert`] / `DELETE …/snooze` [`unsnoozeAlert`], `POST …/resolve`
  [`resolveAlert`], `PUT …/feedback` [`setAlertFeedback`].
- Inbox: `GET /v1/notifications` [`listNotifications`], `GET /v1/notifications/stream`
  [`streamNotifications`], `GET /v1/notifications/badge` [`getNotificationBadge`],
  `POST /v1/notifications/read` [`markNotificationsRead`], `GET /v1/notifications/{id}` [`getNotification`].
- Presence: `POST /v1/clients/presence` [`updatePresence`].

**Build.**
- Alert toasts + a top strip from `streamAlerts`/`listAlerts`; a firing alert offers ack/snooze/
  resolve (and feedback) where the envelope allows; selecting an alert opens its object.
- Notification inbox: list + `streamNotifications`, the bell badge from `getNotificationBadge`
  (per-device via the 003 `Foresignal-Device-Id`), mark-read (`markNotificationsRead`) — reading
  never acknowledges an alert.
- Presence heartbeat (`updatePresence`) while the window is focused (active/idle/background).

**Match the mock.** A notifications **bell with an unread badge** in the top nav; severity-colored
alert **toasts** and an optional top **alerts strip**. A firing alert offers Ack / Snooze / Resolve
inline where the envelope allows; clicking opens the alert's object. The inbox lists notifications
with per-device read state.

**Done when.** A firing alert shows a toast with working ack/snooze; the inbox lists notifications
with a correct unread badge that clears on read; presence is reported. Playwright: alert toast + ack,
inbox badge.

**Commit.** `029: Alerts And Notifications`; `completion-reports/029-CR-Alerts-And-Notifications.md` (hash + owner questions).
