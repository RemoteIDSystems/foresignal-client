# R2-006 — Completion Report: RBAC-Aware UI

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule).                                       |
| Implementation commit | `2a2a63d3a51224a4f36fcd9015c98286b0515135`                                              |
| Run mode              | Unattended batch (no pause at this gate).                                               |
| Screenshots           | None (compile-only run).                                                                |
| Mock comparison       | Not applicable: no screen's layout changed; see "Compared to the mock".                 |

## What was built

Permission-aware gating of the client's own actions, plus one shared, dead-end-free surface for
auth/authorization refusals. No new backend calls — permissions come from the session
(`SessionToken.permissions[]` at login, `Me.permissions[]` on rehydrate, read via `usePermissions()`).

- **`src/auth/permissions.ts`:** `END_USER_PERMISSIONS` — the six keys this client gates on
  (`data.read`, `intel.read`, `self.preferences`, `self.sources`, `self.alerts`, `self.llm`) — with
  a `Permission` type, `can(permissions, permission)`, and `useCan()`. The operator keys
  (`users.manage`, …, `llm.shared.manage`) are deliberately absent: they gate `foresignal-admin`, and
  no UI for them is built here.
- **`src/auth/RequirePermission.tsx`:** renders an action only when the principal holds the
  permission, else a `fallback` (nothing by default). For later prompts to wrap their actions.
- **`src/api/errors.ts` — `accessRefusal(error)`:** classifies a refusal for the UI — `401` →
  `sign-in`, `403 PERMISSION_DENIED` → `permission` (the backend's `detail`), `403 INSUFFICIENT_SCOPE`
  → `scope` naming the `requiredScope` the `Problem` carries. Returns `null` for anything else.
- **`src/auth/AccessNotice.tsx`:** renders that classification — a `401` offers a sign-in link, a
  `403` states the missing permission or required scope. The shared refusal surface.
- **Applied to alert actions (additive):** `AppShell` and `AlertsView` now compute
  `canAct = useCanActOnAlerts(api, token) || useCan()('self.alerts')`. The long-standing
  agent/admin **scope** path is untouched; a signed-in principal holding `self.alerts` now also may
  act. OR semantics only ever grant, so nothing regresses.

Anonymous visitors have no permissions, so every `can(...)` is `false` and only open-read views
remain — all nav tabs stay reachable, with the R2-003 sign-in affordance always present.

## Prompt vs. contract note (verified)

The prompt says a permission refusal "names the `requiredPermission`/`requiredScope`." The `Problem`
schema carries **`requiredScope`** (enum `read`/`agent`/`admin`) but **no `requiredPermission`**
field (verified: it is not a property of `Problem`, and the two spec hits are prose). So a
`PERMISSION_DENIED` notice uses the backend's `detail`/`title`; only `INSUFFICIENT_SCOPE` names a
machine value. Owner question 1.

## Why gating is light here

The permissioned client actions are mostly built by later prompts: `self.preferences` (R2-007),
`self.sources`/`self.llm` (R2-009). This prompt lands the mechanism (`useCan`/`RequirePermission`),
the centralized refusal surface (`accessRefusal`/`AccessNotice`), and the one action that already
exists — acting on alerts — so later prompts wrap their own actions with the same primitives rather
than inventing per-feature gates. Views remain open-read, as the prompt requires.

## Tests written (not run)

- **`src/auth/permissions.test.tsx`** (4): `can()` is true only for a held key; `RequirePermission`
  renders children for a permitted principal and the fallback for a refused one and for an anonymous
  visitor.
- **`src/auth/AccessNotice.test.tsx`** (4): `401` shows the sign-in message and a `/signin` link;
  `INSUFFICIENT_SCOPE` names the required scope and shows no link; `PERMISSION_DENIED` shows the
  backend detail; a non-access error renders nothing.

## Checks

| Check                                                   | Result                                      |
| ------------------------------------------------------- | ------------------------------------------- |
| `npm run typecheck`                                     | Passed                                      |
| `npm run lint`                                          | Passed                                      |
| `npx prettier --check src e2e scripts`                  | Clean                                       |
| `npm run build`                                         | Passed (pre-existing chunk warning)         |
| `npm test`, `npm run e2e`, browser run                  | **Not run** (standing rule)                 |
| Guard: `check_us_english.py` over the new/changed files | 0 British spellings                         |

## Compared to the mock

No layout changed: nav tabs and open-read views are untouched; only an action's availability now
also honors `self.alerts`, and refusals get a shared notice. The mocks still match.

## Decisions taken (unattended)

1. **No view is gated on permissions** — only actions — because open reads mean every view is
   reachable anonymously. Nav tabs are unchanged.
2. **Alert actions use OR semantics** (scope OR `self.alerts`) so the RBAC layer is additive and the
   existing scope-based gate (and its tests) keep working for API-token users.
3. **`accessRefusal` lives in `src/api/errors.ts`** (pure, testable) with the React rendering in
   `AccessNotice`; the prompt's "centralize in errors.ts" is met by the classifier, kept free of
   React.

## Owner questions

1. **`requiredPermission` in problems.** The contract has `requiredScope` but no
   `requiredPermission`. Should `PERMISSION_DENIED` problems carry the missing permission key so the
   notice can name it, or is `detail` the intended surface?
2. **Alert-action grant** (decision 2): acting on alerts is granted by the agent/admin scope OR the
   `self.alerts` permission. Confirm that OR is right, versus requiring the permission specifically
   for session users.

Questions carried from R2-001–R2-005 keep their defaults.
