# 029 — Completion Report: Alerts And Notifications

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `275971ef6b86777101af0a69633ebe354eed4bab`                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                          |
| Screenshots           | None taken (compile-only run). `e2e/alerts.e2e.ts` uses real clicks when it runs.       |
| Mock comparison       | From the design PNGs' top bars (read in this session) and the code.                     |

## Results

- **Live alerts on every screen.**
  - The app shell reads the open alerts (`listAlerts`, state firing or acknowledged, 50 at most).
  - It follows the alert lifecycle stream (`streamAlerts`):
    - `alert` adds an alert;
    - `alert.updated` and `alert.enriched` replace it by id; the newer revision always wins, so a
      replayed event never undoes an acknowledgment;
    - `alert.resolved` removes it.
  - Suppressed alerts are never shown.
- **Alert toasts** at the bottom right, for alerts that fire while the page is open:
  - severity-colored (critical, warning, info), with the rule's name, message, severity, state and
    time; at most three, newest on top;
  - clicking one **opens the alert's object** (`alert:<id>`, as search results open alerts);
  - a toast leaves when dismissed or when its alert stops firing.
- **The top alerts strip**, under the navigation while any alert is open:
  - "N firing, M acknowledged", and the most pressing alert (firing first, then severity, then
    newest) with its actions;
  - **Show all N** lists every open alert, each with its actions;
  - hidden when nothing is open.
- **Inline lifecycle actions** on toasts and strip entries:
  - **Ack** (`acknowledgeAlert`), **Snooze 1h** or **Unsnooze** (`snoozeAlert` / `unsnoozeAlert`),
    **Resolve** (`resolveAlert`) and a **Feedback** select (`setAlertFeedback`: Useful, Noise,
    Late, False positive);
  - offered only as the alert's state allows and when the token's scopes include `agent` or
    `admin` (`getMe`). A failed call says why.
- **The notifications bell** in the top bar:
  - shows this device's **unread badge** (`getNotificationBadge`), red while a critical one is
    unread, capped at "99+";
  - the inbox stream (`streamNotifications`) keeps it current: `badge` events move the counts and
    `notification` events add items.
- **The inbox** opens from the bell:
  - it lists the newest notifications (`listNotifications`) with their **read state on this
    device**: event, severity, live alert state, time and the body's first line;
  - clicking one marks it read (`markNotificationsRead`, `ids`) and opens its alert's object;
  - **Mark all read** moves the read cursor (`upToId`) and clears the badge;
  - reading never calls an alert operation.
- **Per device.** The client already sends `Foresignal-Device-Id` on the inbox operations (003).
  The inbox stream now sends it too.
- **Presence.** `updatePresence` (kind `web`, TTL 120 s) is sent:
  - at once;
  - on visibility, focus and blur changes;
  - on input after idling;
  - every 60 s.

  The state is `active` while focused and in use, `idle` when unfocused or after 5 minutes without
  input, and `background` when hidden.

- **Without a token** the inbox, badge, presence and actions are off; the bell says the inbox needs
  a token. Alerts still show, because the alert list and stream are open reads.

## What was built

- `src/api/stream/EventSubscription.ts`: a resumable SSE subscription for streams other than the
  change stream. It provides:
  - `Last-Event-ID` resume;
  - a fresh `?ticket=` per connection, with the cached ticket dropped after a 401;
  - extra headers;
  - a 45 s heartbeat timeout;
  - jittered backoff to 30 s, or the server's `Retry-After`;
  - `INVALID_CURSOR` forgetting the cursor;
  - a token requirement;
  - `heartbeat` events are not handed on.
- `src/alerts/alertApi.ts`: the alert, inbox, badge, read and presence operations.
- `src/alerts/AlertFeed.ts`, `InboxFeed.ts`: snapshot stores read with `useSyncExternalStore`. They
  are started by the app shell and restarted on a token change; one never started stays stopped.
- `src/alerts/presence.ts`: `presenceState`, `startPresence`.
- `src/alerts/alertView.ts`:
  - severity tones, `alertRef`, `alertTitle`;
  - `canActOnAlerts`, `alertActions`, `mostPressing`;
  - the feedback options; `badgeText`.
- `src/alerts/useAlerts.ts` and `callerApi.ts`: the feed hooks, and the scope check read again per
  token.
- Components:
  - `AlertActions.tsx`, `AlertToasts.tsx`, `AlertStrip.tsx`;
  - `NotificationBell.tsx` (bell and inbox popover);
  - `Alerts.module.css`.
- Wiring:
  - `Session` gains `alerts` and `inbox`;
  - `AppShell` starts them and presence, and renders the strip and toasts;
  - `TopNav` swaps the placeholder bell for `NotificationBell`.

## How it was checked

### Tests (written, not run)

- `api/stream/EventSubscription.test.ts` (6):
  - an anonymous connection, with heartbeats not handed on;
  - a ticket, headers and `Last-Event-ID` on reconnect;
  - no connection without a needed token;
  - `INVALID_CURSOR`, and the 401 ticket drop;
  - heartbeat timeout and `Retry-After`;
  - stop.
- `alerts/AlertFeed.test.ts` (5):
  - the open-alerts query and the stream;
  - fired, updated, enriched and resolved;
  - the newer revision and three toasts;
  - no toast for a replay or a suppressed alert;
  - restart only when started.
- `alerts/InboxFeed.test.ts` (4):
  - nothing without a token;
  - the badge and the stream with the device id, and `notification` and `badge` events;
  - one list read, then mark one and mark all;
  - the merge order.
- `alerts/presence.test.ts` (3): the states; at once, on change and every beat; nothing without a
  token.
- `alerts/alertView.test.ts` (5): names, scopes, actions by state, the most pressing, the badge cap.
- `alerts/Alerts.test.tsx` (7):
  - a toast's severity, opening and Ack;
  - Snooze, Unsnooze, feedback, a read-only token, Dismiss;
  - the strip's counts, Show all, and Resolve; no strip with nothing open;
  - the bell's badge and inbox rows;
  - marking one read, opening it, and Mark all read; the no-token text.
- `e2e/alerts.e2e.ts` (3). The test token is used only by stand-ins; other requests go to the
  backend as open reads. The specs check:
  - **an alert toast and Ack:** the toast shows, its severity edge differs from its border color,
    a real mouse click on Ack sends `acknowledgeAlert` and the toast goes, and the strip then
    reads "0 firing, 1 acknowledged";
  - **the inbox badge:** 2 unread, the inbox lists two, Mark all read sends `{upToId: 12}`, the
    badge clears, and no ack is sent;
  - **presence:** reported as `web` with a 120 s TTL;
  - no console errors in any of them.

### Checks

| Check                                                       | Result                                     |
| ----------------------------------------------------------- | ------------------------------------------ |
| `npm run typecheck`                                         | Passed                                     |
| `npm run lint`                                              | Passed                                     |
| `npx prettier --check src e2e`                              | Passed                                     |
| `npm run build`                                             | Passed. `index` 782.43 kB (238.08 kB gzip) |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                |
| Guard: `test_us_english.py`                                 | 14 tests OK (172.5 s)                      |
| Guard: `check_us_english.py` over the project               | 803 hits, unchanged                        |
| Guard: `check_us_english.py` over the new and changed files | `[]`                                       |

## Compared to the mock

From the design PNGs' top bars and the prompt's description; no screenshot was taken.

- **Matches:**
  - the bell in the top bar, now with an unread badge;
  - severity-colored toasts with inline Ack, Snooze and Resolve;
  - an alerts strip at the top;
  - clicking an alert opens its object.
- **Differs:**
  - **The mock's "Alerts" nav tab** is not added. Alert rules are 030's, and the alert list here is
    the strip.
  - **Toasts sit at the bottom right**, where the app's existing toasts are; the mock does not show
    one in place.

## Decisions taken (unattended run)

1. **Who may act.** Alert objects carry no actions envelope (the `Alert` schema has no `actions`;
   `getAlert` returns the alert itself). So "where the envelope allows" is read as: the alert's
   state allows it, and the token's scopes include `agent` or `admin`, which is what the lifecycle
   operations require.
2. **Snooze length:** one hour, the backend's own default for a snooze action
   (`NotificationAction.params.duration`: "snooze 15m–24h (default 1h)").
3. **Toasts** only for alerts fired while the page is open, never for those listed on load; at most
   three.
4. **The strip** shows whenever an alert is open. It is not a setting.
5. **Opening an alert** uses its `alert:<id>` ref, the same path as an alert search result.
6. **Presence states:**
   - `active`: visible, focused, input within 5 minutes;
   - `idle`: visible but unfocused, or no input for 5 minutes;
   - `background`: hidden.

   Reports go out every 60 s with a 120 s TTL.

7. **Backend values as is:** severities (`critical`, `warning`, `info`), states (`firing`,
   `acknowledged`, `resolved`) and events (`alert`, `briefing`, `system`) are shown as the backend
   names them.

## Deviations from the prompt text

- **`getAlert` and `getNotification`** are wrapped in `alertApi.ts` but not called by the UI. The
  stream carries full alerts, and opening goes through the alert's object.
- **"Desktop presence":** the client reports `kind: "web"`, since this is the web client. The
  backend's kinds are `desktop`, `mobile` and `web` (owner question 2).

## Backend observations

These come from curl in this session:

- `GET /v1/alerts/stream` answered 200 `text/event-stream` without a token, opening with `:open`
  and sending `event:heartbeat` / `data:{}`.
- `GET /v1/alerts?limit=3` answered `{"items":[],"nextCursor":null}`: no alerts locally.
- Without a token, these answered **401**:
  - `POST /v1/clients/presence`;
  - `GET /v1/notifications`;
  - `GET /v1/notifications/badge` ("This endpoint always requires a token, even while open reads
    are on");
  - `POST /v1/alerts/1/ack`;
  - `GET /v1/rules`.

## Owner questions

1. **Alert actions envelope.** Should alerts carry an `actions` envelope, as other objects do, so
   the client offers exactly what the backend allows? **Default in place: the alert's state plus
   `agent` or `admin` scope.**
2. **Presence kind.** Should the browser client report `web` or `desktop`? The backend defers phone
   notifications while "any desktop is active". **Default in place: `web`.**
3. **Snooze choices.** One fixed duration, or a menu (15 m, 1 h, 4 h, 24 h)? **Default in place:
   1 h.**
4. **Alerts strip.** Always shown when an alert is open, or only for critical ones, or a setting?
   **Default in place: whenever one is open.**

Questions still open from earlier reports keep their defaults.
