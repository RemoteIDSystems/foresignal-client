# 030 — Completion Report: Alert Rules And Web Push

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `6e4312eba4608752e8805bd50fb64c75c167fc5c`                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                          |
| Screenshots           | None taken (compile-only run). `e2e/rules-push.e2e.ts` uses real clicks when it runs.   |
| Mock comparison       | From the Conflict design PNG's top bar (read in this session) and the code.             |

## Results

- **An Alerts screen** at `/alerts`, with an **Alerts** tab in the top navigation between
  Intelligence and Operations, as the Conflict mock places it. It has three tabs:
  - **Open Alerts:** every firing or acknowledged alert, with its 029 actions; clicking one opens
    its object;
  - **Rules:** the rule form and the rule list;
  - **Delivery:** this browser's Web Push switch and the delivery channels.
- **Rule authoring.** The form builds a `TriggerRuleInput` and posts it; the client evaluates
  nothing. It covers:
  - name, severity (`info`, `warning`, `critical`) and type (`record`, `count`, `absence`,
    `anomaly`);
  - kinds and sources, suggested from `listKinds`;
  - threshold conditions (`>`, `>=`, `<`, `<=`, `==`, `!=`, `in`, `notIn`, `exists`, `startsWith`,
    `matches`), ANDed, each value typed as its operator takes it;
  - the scope: everywhere, the current map view (a polygon, split in two across the antimeridian),
    region codes as a region preset (`geofenceRef` `country` / `admin1`), or a watchlist (an
    `inWatchlist` condition);
  - record rules: mode (`match`, `enter`, `exit`); windowed rules: the window, the count comparison
    and threshold, anomaly direction and sensitivity, and group-by;
  - cooldown, tags, an active window (days, start, end, time zone) and the enrichment toggle.
- **Scope prefill.** "Create alert" links fill the scope in:
  - **Alert on this view** on the Global map, beside the find bar (`/alerts?new=view`): the last
    committed map view;
  - **Create alert** on a situation's analysis header (`/alerts?new=situation&ref=<id>`): the
    situation's region codes and its title (for example, a situation tagged `RU`, `PL`, `EE` gives
    a Russia–NATO region watch);
  - `/alerts?new=watchlist&ref=<id>`: the watchlist (no watchlist screen links it yet; owner
    question 4).
- **Dry run inline before save.** **Dry run** backtests the draft over stored data
  (`testTrigger`, `simulate=true`, last 24 hours or 7 days) and shows, under the form:
  - matches, would fire and would suppress;
  - the backend's warnings, and whether the result is approximate or truncated by retention;
  - the first ten matching records;
  - for a windowed rule, the latest window evaluations.
- **Save** creates the rule (`createTrigger`) or replaces it (`updateTrigger`). An edit keeps every
  field the form does not show (escalation policy, storm cap, `near`, approach conditions, a drawn
  corridor), since an update replaces the whole rule.
- **Rule management.** Each rule shows its severity, type, state (disabled, muted, snoozed, error),
  alert counts, last fired time, last error and window-group counts. With the agent scope it offers
  **Edit**, **Enable** or **Disable**, **Mute 4h** or **Unmute**, **Snooze 1h** or **Unsnooze**, and
  **Delete** (confirmed). **Detail** shows:
  - **window state** per group (windowed rules): state, value against threshold, since;
  - **baseline** (anomaly rules): weeks learned, learning or low-confidence, an ECharts line of the
    learned mean per slot for up to four groups, and **Rebuild baseline**;
  - **tuning suggestions** (open ones) with **Apply**, and the **tuning log**;
  - **delivered by:** the enabled channels that take `alert` events and name the rule or all rules.
- **Delivery channels** (admin scope): name, type, rules, severity floor, last delivery and failures
  in 24 h, and **Test** (`testChannel`) with its outcome.
- **Web Push**, a switch on the Delivery tab ("Browser notifications for alerts"). Turning it on:
  1. registers the service worker (`sw.js`) and asks for notification permission;
  2. subscribes with the server's VAPID key (`getVapidPublicKey`);
  3. registers the subscription (`createPushSubscription`: `browser`, `foresignal` payloads, `alert`
     events of every rule, the browser's language);
  4. echoes the code from the verification push, which the worker hands to the page
     (`verifyPushSubscription`).

  Turning it off deletes the subscription (`deletePushSubscription`) and unsubscribes. The switch
  says where it stands: not supported, off, subscribing, waiting for the verification push, on,
  blocked, or why it failed.

- **Push with the tab closed.** The service worker shows each `alert`, `briefing` or `system` push
  as a notification (title, body, tag, up to two action buttons). Activating it:
  - with a page open: moves that page to `/global?open=alert:<id>` and focuses it;
  - with none open: opens one there;
  - an action button (ack, snooze, mute, feedback) posts the backend's single-use capability URL
    instead and opens nothing.
- **`?open=<ref>`** on any route opens that object once, through the same path as a search result
  or an alert toast (029).

## What was built

- `src/rules/triggerApi.ts`: the trigger, test, mute, snooze, window-state, baseline, suggestion,
  tuning-log, channel, kind and watchlist operations; `dryRunRule`.
- `src/rules/ruleDraft.ts`: the form model:
  - `newDraft`, the scopes (`viewportScope`, `regionScope`, `watchlistScope`, `scopeLabel`);
  - `conditionValue`, `bboxGeofence`, `regionGeofence`, `draftProblems`;
  - `toRuleInput`, `draftOf`, `storedInput`, `stillUntil`.
- `src/rules/ruleView.ts`: `baselineSeries`, `channelsForRule`, `ruleStatus`, `windowText`, and the
  mute and snooze durations.
- Components: `RuleForm.tsx`, `DryRunResult.tsx`, `RulesList.tsx`, `RuleDetail.tsx`,
  `ChannelsPanel.tsx`; `Rules.module.css`.
- `src/push/`:
  - `pushApi.ts`: the five push operations;
  - `webPush.ts`: `WebPush`, the subscription controller, with an injectable browser environment;
    `base64UrlToBytes`;
  - `useDeepLinks.ts`: `?open=` and the worker's open message; `routeOf`;
  - `PushToggle.tsx`.
- `public/sw.js`: the service worker (push and notification click only; it caches nothing).
- `src/views/alerts/AlertsView.tsx`; the route, the nav tab, `Session.push`, `useDeepLinks` in the
  app shell, the Global and situation "Create alert" links.
- `src/ui/charts/chartOptions.ts`: `slotMeansOption` (the baseline chart).

## How it was checked

### Tests (written, not run)

- `rules/ruleDraft.test.ts` (8):
  - the three prefills and their labels;
  - the map view as a polygon and across the antimeridian;
  - region codes as country and admin-1;
  - condition values by operator;
  - the problems listed;
  - a scoped threshold rule built whole (Russia–NATO region codes);
  - the watchlist condition;
  - a windowed rule without `mode` and `onlyNew`;
  - an edit keeping unshown fields and dropping backend-written ones;
  - a stored rule read back, a corridor kept as stored.
- `rules/ruleView.test.ts` (5): the baseline series; the channels for a rule; the status words and
  window text; the dry run's create, test (simulated) and delete; the copy deleted after a failed
  test.
- `push/webPush.test.ts` (6):
  - the VAPID key decodes to a 65-byte point;
  - the full subscribe and verify flow, with the request bodies;
  - a code that arrives before the subscription id;
  - a verification push that never comes;
  - no token, permission refused, push unsupported;
  - turning off.
- `push/serviceWorker.test.ts` (5) runs `public/sw.js` against a fake worker scope:
  - the verification hand-off;
  - an alert notification with its route;
  - an unreadable payload ignored;
  - a click moving an open page or opening one;
  - an action button posting its URL.
- `push/useDeepLinks.test.tsx` (2): routes under a base; `?open=` once and the worker's open
  message.
- `views/alerts/AlertsView.test.tsx` (7):
  - the form's dry run, inline, with the requests;
  - Save;
  - the problems and the agent-scope note;
  - a windowed type;
  - the list's mute, snooze, disable and delete, the detail's suggestion and delivery;
  - the push switch unsupported;
  - the screen opened from a situation's "Create alert" link.
- `app/App.test.tsx`: the Alerts tab added to the routed tabs.
- `e2e/rules-push.e2e.ts` (2). The test token is used only by stand-ins; other requests go to the
  backend as open reads. The specs check:
  - **authoring:** a person fills a Russia–NATO region rule with a condition, clicks **Dry run**,
    and the preview renders (would fire, the warning, two match rows); the copy is created
    disabled, tested with `simulate=true` and deleted; **Save rule** posts it enabled and it is
    listed;
  - **push:** the switch is clicked; a verification push delivered to the real service worker
    through the DevTools protocol (`ServiceWorker.deliverPushMessage`) turns it on and its code is
    echoed; an alert push shows a notification in the worker, and activating it moves the page to
    `/global` and opens `alert:5`. The browser's push service is stood in (`PushManager.subscribe`),
    since headless Chromium has none;
  - no console errors in either.

### Checks

| Check                                                       | Result                                                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                                                           |
| `npm run lint`                                              | Passed (includes `public/sw.js`)                                                                                                 |
| `npx prettier --check src e2e`                              | Passed                                                                                                                           |
| `npm run build`                                             | Passed. `index` 825.70 kB (250.04 kB gzip); `dist/sw.js` present                                                                 |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                                                      |
| Guard: `test_us_english.py`                                 | 14 tests OK (173.4 s)                                                                                                            |
| Guard: `check_us_english.py` over the project               | 803 hits, unchanged                                                                                                              |
| Guard: `check_us_english.py` over the new and changed files | 2 hits, both the attribution JSON key the backend spells the British way, already in `App.test.tsx` (a wire name; left as it is) |

## Compared to the mock

From the Conflict design PNG's top bar and the prompt's description; no screenshot was taken.

- **Matches:**
  - the **Alerts** nav tab with a bell icon, between Intelligence and Operations;
  - the form uses the dashboard's panel, field and button styling;
  - "Create alert" from the map and from a situation;
  - the dry-run result inline before save;
  - a clear Web Push switch.
- **Differs:**
  - **The mocks show no Alerts screen**, so its layout (three tabs, cards) follows the Imagery
    screen's.
  - **The push switch lives on the Alerts screen's Delivery tab**, not in Settings (owner question
    5).

## Decisions taken (unattended run)

1. **Dry run of an unsaved rule.** `testTrigger` backtests stored rules only
   (`POST /v1/triggers/{ruleId}/test`). The form creates a **disabled copy** named "… (dry run)",
   tests it and deletes it. The rule being edited is never changed by a dry run. A copy that fails
   to delete is logged (owner question 1).
2. **Simulated dry runs** (`simulate=true`), so "would fire" counts cooldown, snooze, the storm cap
   and the active window, as the prompt's "what it would have fired" asks.
3. **Region codes** of a situation are split by shape: `CC` into `geofenceRef.country`, `CC-…` into
   `geofenceRef.admin1`; `ZZ` (untagged) is left out (owner question 2).
4. **Watchlist scope** is an `inWatchlist` condition without a path, so each source's declared
   identity field is used, as the backend describes.
5. **Edits keep unshown fields:** an update sends the stored rule with the form's fields laid over
   it, minus the backend-written ones and the deprecated `source` / `kind` aliases.
6. **Windowed rules** are sent without `mode`, `onlyNew` and `reappearAsEnter`, which the backend
   refuses for them (`WINDOW_RULE_INVALID`). Their window uses the backend's defaults
   (`distinctBy: entity`, 500 groups; anomaly `1h` buckets by `hour-of-week`, 8 weeks).
7. **Durations from the list:** mute 4 h (the backend's example) and snooze 1 h (as 029).
8. **The browser's push subscription** takes `alert` events of every rule (`ruleIds: null`). Its id
   is kept in this browser (`foresignal.push`), since `listPushSubscriptions` needs admin scope.
9. **Channels** are shown, tested and matched to rules, but not edited: `updateChannel` is not one of
   the prompt's operations and needs admin scope.
10. **Writing rules** uses the same scope check as the 029 alert actions (`agent` or `admin`).
11. **Backend values as is:** severities, types, modes, operators, window states, suggestion kinds
    and channel types are shown as the backend names them.

## Deviations from the prompt text

- **No in-app "send a test push".** The OpenAPI has a test for push devices and providers, not for
  browser subscriptions; the verification push is the first push a browser receives.
- **"See it fire as an alert (029)"** is the backend's part: the client authors and lists the rule,
  and 029's stream shows its alerts. No alert fired in this session.
- **Watchlist "Create alert"** has no entry point yet: there is no watchlist screen. The link form
  (`?new=watchlist&ref=`) and the form's watchlist scope are in place.

## Backend observations

These come from curl in this session:

- `GET /v1/triggers` answered `200 []`: no rules locally.
- `GET /v1/push/vapid-public-key` answered **500** `INTERNAL_ERROR` (correlation id
  `19264b02-b27e-46f7-b34c-794b0b52c6dd`), although it needs no token. Web Push cannot be turned on
  against this backend until that is fixed (owner question 3).
- Without a token, these answered **401**:
  - `POST /v1/triggers`;
  - `POST /v1/triggers/{id}/test`;
  - `GET /v1/watchlists`;
  - `GET /v1/channels`, `GET /v1/channels/types`;
  - `GET /v1/push/subscriptions`.
- `GET /v1/situations?limit=2` answered `{"items":[],"nextCursor":null}`: no situation to prefill
  from locally.

## Owner questions

1. **Dry run of unsaved rules.** Should the backend offer a dry run on a rule body (no stored rule),
   so the client need not create and delete a disabled copy? **Default in place: a disabled copy,
   tested and deleted.**
2. **Admin-1 codes.** Does `geofenceRef.admin1` take the 040 region code as is (`US-TX`), as the
   client sends it? **Default in place: the code as is.**
3. **VAPID key.** `getVapidPublicKey` answers 500 locally. Is push configured off on this backend,
   and should the client hide the switch when it is? **Default in place: the switch shows the
   backend's error.**
4. **Watchlist entry point.** Where should "Create alert" for a watchlist live, before a watchlist
   screen exists? **Default in place: the form's scope menu.**
5. **Push switch place.** Settings, the Alerts screen, or both? **Default in place: the Alerts
   screen's Delivery tab.**
6. **Push filter.** Every rule's alerts, or a chosen set of rules or a severity floor? **Default in
   place: every rule, every severity.**

Questions still open from earlier reports keep their defaults.
