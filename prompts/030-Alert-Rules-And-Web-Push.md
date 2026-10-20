# 030 — Alert Rules And Web Push

**Goal.** Let the user **author alert rules** — thresholds and conditions scoped to the current
view / situation / watchlist — that the backend evaluates, and **subscribe the browser to Web
Push** so alerts arrive with the tab closed. The client authors rules and subscribes; the backend
owns all evaluation and delivery (presentation-only, Charter §3).

**Read first.** 029-CR; [Architecture.md](../docs/Architecture.md) §13; Charter §3, §6.1. Design:
the Alerts area and a "Create alert" affordance from the map / situation / watchlist context.

**Backend (OpenAPI only).**
- Triggers: `GET /v1/triggers` [`listTriggers`], `POST /v1/triggers` [`createTrigger`],
  `GET`/`PUT`/`DELETE /v1/triggers/{ruleId}` [`getTrigger`/`updateTrigger`/`deleteTrigger`],
  `POST /v1/triggers/{ruleId}/test` [`testTrigger`] (dry-run against stored data),
  `POST`/`DELETE …/mute` [`muteTrigger`/`unmuteTrigger`], `POST`/`DELETE …/snooze`
  [`snoozeTrigger`/`unsnoozeTrigger`], `GET …/window-state` [`getTriggerWindowState`],
  anomaly baseline `getTriggerBaseline`/`rebuildBaseline`, tuning `listTuningLog`/`applyTuningSuggestion`.
- Channels (delivery targets): `GET /v1/channels` [`listChannels`], `GET /v1/channels/types`
  [`listChannelTypes`], `POST /v1/channels/{id}/test` [`testChannel`].
- Web Push: `GET /v1/push/vapid-public-key` [`getVapidPublicKey`], `POST /v1/push/subscriptions`
  [`createPushSubscription`], `POST …/{id}/verify` [`verifyPushSubscription`],
  `GET /v1/push/subscriptions` [`listPushSubscriptions`], `DELETE …/{id}` [`deletePushSubscription`].

**Build.**
- **Rule authoring UI:** a form to create/edit a trigger scoped to the current context —
  geofence / region presets (e.g. `geofenceRef: {country:[…]}`), kinds, sources, threshold
  conditions (`>`, `>=`, `in`, …, ANDed), windowed `count`/`absence`/`anomaly`, severity, active
  window, and the enrichment toggle. **Prefill the scope** from the current viewport, selected
  situation, or watchlist (e.g. "watch this region/situation"). The client builds the rule spec and
  POSTs it — **it never evaluates anything.**
- **Dry-run** with `testTrigger` before saving (show what it would have fired on stored data).
- **Manage rules:** list, edit, mute/snooze, delete; show `window-state` and, for anomaly rules, the
  baseline; surface and apply tuning suggestions.
- **Delivery targets:** route a rule to channels (list/types/test) and to this browser via push.
- **Web Push:** register a service worker; subscribe with the VAPID key (`getVapidPublicKey`),
  register (`createPushSubscription`), verify, and handle an incoming push → show a notification and
  deep-link into the app (reuse the 029 action handling). Allow unsubscribe.
- Honor the Charter: no rule evaluation in the client, no second service.

**Match the design.** The rule-authoring form uses the dashboard's panel/form styling; prefill scope
from the current viewport / selected situation / watchlist, and show the dry-run (`testTrigger`)
result inline before save. Web-Push opt-in is a clear toggle in Settings/Alerts.

**Done when.** A user can create a threshold rule scoped to a region/situation (e.g. a Russia–NATO
watch), dry-run it, save it, and see it fire as an alert (029); the browser receives a Web Push for
a firing alert with the tab closed, and activating it opens the alert. Playwright: author a rule →
`testTrigger` preview renders; subscribe → a test push is received and routes into the app.

**Commit.** `030: Alert Rules And Web Push`;
`completion-reports/030-CR-Alert-Rules-And-Web-Push.md` (hash + owner questions).
