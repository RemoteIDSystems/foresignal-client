# R2-009 — Completion Report: Account My Sources, Quota And Relevance

| Field                 | Value                                                      |
| --------------------- | ---------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule).          |
| Implementation commit | `7f98f0d`                                                  |
| Run mode              | Unattended batch (no pause at this gate).                  |
| Screenshots           | None (compile-only run).                                   |
| Mock comparison       | Not made visually; a new screen on the shared UI surfaces. |

## What was built

An Account sources screen at `/account/sources` (linked from the account page), each section gated
by the `self.*` permission the prompt names.

- **`src/account/sources.ts`** — `getMySources` / `updateMySources`, a subscribable
  `UserSourcesStore` on the `Session` (loaded at sign-in, cleared when anonymous), `disabledSourceIds`,
  and a `UserSourcesContext` with `useUserSources` / `useDisabledSources`.
- **`src/account/quota.ts`** — `getMyQuota` / `getMyLlmBudget`.
- **`src/account/sourceRelevance.ts`** — `analyzeTriggerSources`.
- **`src/account/SourcesView.tsx` (+css)** —
  - **Source view** (`self.sources`): each `UserSourcePref` as an enable checkbox, a display-name
    override, and an optional custom color (a checkbox toggles the override on/off; off persists
    `color: null`). Saves through `updateMySources` and publishes the result to the session store.
  - **Quota & usage**: pairs each `Quota` limit with its `QuotaUsage.usage` count (null limit reads
    "unlimited"). Shown to any signed-in user (self-service, no RBAC key).
  - **LLM budget** (`self.llm`): the month's `totalSpentUsd` and each `LlmBudgetProvider` (shared vs
    personal, spent, cap, remaining).
  - **Source relevance** (`self.alerts`): runs `analyzeTriggerSources` over the user's currently
    enabled sources (2–50) and shows the advisory per-source verdicts (relevant / marginal /
    not-meaningful / unrated) with the model's reasons and summary. It changes nothing.

## How the per-user view drives the layers

The per-user **visibility** is wired into the live map through the existing hidden-sources path:
`useDisabledSources()` (from the `UserSourcesContext`) is unioned into the FILTERS tab's hidden set
in both `MapView` and `GlobalDashboard`, which already feed `hiddenSources` down to
`recordLayerSet` / `shownRecords`. So turning a source off in this screen removes its records from
the map and record layers — one hook, no second path. `disabledSourceIds` is unit-tested, and the
union is a one-line `new Set([...layerState.hiddenSources, ...disabledByUser])` in each view.

## Scope note on styling (owner question 1)

`displayName` and `color` round-trip through the API and are editable here, but **applying a
per-user color/label to the drawn records** is not wired in this pass. The record styling pipeline
(`featureStyle` → `recordLayerSet`) resolves colors from the shared style model via guard-tested
pure functions with no per-user override channel; threading one through them correctly cannot be
proven in a compile-only run (no browser), so visibility — the dominant, low-risk driver — is wired
and styling is raised as an owner question rather than half-wired. The overrides are stored and
ready for whichever surface should consume them.

## Tests written (not run)

- **`src/account/sources.test.ts`** — `disabledSourceIds`; read/replace round-trip; the store loads
  and clears.
- **`src/account/quota.test.ts`** — quota/usage and LLM budget reads.
- **`src/account/sourceRelevance.test.ts`** — `analyzeTriggerSources` sends the ids and returns the
  verdicts.
- **`src/account/SourcesView.test.tsx`** — the editor lists the view, a disable saves through the
  API, quota pairs usage with limits and the budget shows spend; the relevance analysis runs and
  shows verdicts; sections gate by permission (no `self.sources` → editor hidden; no `self.llm` /
  `self.alerts` → those panels absent; quota still shown); anonymous → sign-in.

## Checks

| Check                                                   | Result                              |
| ------------------------------------------------------- | ----------------------------------- |
| `npm run typecheck`                                     | Passed                              |
| `npm run lint`                                          | Passed                              |
| `npm run build`                                         | Passed (pre-existing chunk warning) |
| `npm test`, `npm run e2e`, browser run                  | **Not run** (standing rule)         |
| Guard: `check_us_english.py` over the new/changed files | 0 British spellings                 |

(`npm run generate` not needed: surface generated at 2.0.0 in R2-001; this prompt consumes existing
generated types only.)

## Decisions taken (unattended)

1. **A dedicated `/account/sources` route**, linked from the account page, matching the R2-007/008
   account layout.
2. **Visibility wired, styling deferred** (owner question 1) — the honest, verifiable reading of
   "drives the layers" without a browser.
3. **Quota shown to any signed-in user** (self data, no `self.*` key in the contract for it);
   budget, source editing and relevance keep their named gates.
4. **Relevance runs over the enabled set** (2–50), disabled with a hint outside that range, rather
   than adding a separate source picker — it is the natural candidate set for tuning what the user
   watches.
5. **Color override is explicit** — a toggle sets `color` to a default hex or back to `null`; a
   name override is the text field, empty = `null` — so the client never invents a color the user
   did not choose.

## Owner questions

1. **Per-user color/label on the map.** Should the drawn records adopt a user's `color`/`displayName`
   overrides (threaded through the styling pipeline), or are those overrides for a lighter surface
   (legend, filters list) — and should the legend show the user's labels?
2. **Relevance candidate set.** Analyzing the enabled set is the default; should the screen also let
   a user pick an arbitrary 2–50 subset (as a rule's `sources`) to analyze before enabling them?
3. **Quota gate.** Quota/usage is shown to any signed-in user. Confirm there is no permission that
   should gate it.

Questions carried from R2-001–R2-008 keep their defaults.
