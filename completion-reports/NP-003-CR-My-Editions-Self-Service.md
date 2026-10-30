# NP-003 — Completion Report: My Editions Self-Service

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `817c8ca5b0f325d1f70fefbf328c5031502680bc`                                              |
| Run mode              | Unattended batch (NP-000 run sequence): no review-gate pause; last prompt of the campaign. |
| Screenshots           | None taken — `npm test`/browser run are off by standing rule, so no real-device proof was produced. See "Not proven from outside". |
| Mock comparison       | No `design/` mockup covers editions (the six PNGs are map/analysis/dashboard screens), so the editor matches the existing account-area chrome (`AccountView.module.css` fields/actions). |

## Prerequisite (hard stop) — met

`../foresignal/docs/OpenAPI.json` `info.version` reads **`2.1.1`** (checked this session with
`python3 -c "import json; print(json.load(open(...))['info']['version'])"` → `2.1.1`). The backend
**NP-008** set is merged, so this prompt proceeded rather than writing `completion-reports/RUN-STATUS.md`
and aborting; no older spec was vendored.

## The real delta (verified this session, 2.1.0 → 2.1.1)

Every figure is from a command run this session comparing the git-`HEAD` vendored 2.1.0 spec against
the backend's `../foresignal/docs/OpenAPI.json` (2.1.1).

- **Counts.** 711 → 713 paths (**2 added, 0 removed**); 1205 → 1205 schemas (**0 added, 0 removed**).
- **Byte-for-byte vendoring.** `cmp` exits 0; `md5sum` of source and vendored copy are identical
  (`0988112b49b8d9596fd723432011bc9a`).
- **Added paths (2):** `/v1/me/editions/{briefingId}`, `/v1/me/editions/{briefingId}/run`.
- **Added operations (4), all the self-service writes:**
  - `POST /v1/me/editions` [`createMyEdition`] → 201 `Briefing`, body `BriefingInput`.
  - `PUT /v1/me/editions/{briefingId}` [`updateMyEdition`] → 200 `Briefing`, body `BriefingInput`.
  - `DELETE /v1/me/editions/{briefingId}` [`deleteMyEdition`] → 204.
  - `POST /v1/me/editions/{briefingId}/run` [`runMyEdition`] → 202 `BriefingRun`.
  - All four are security `bearerToken`, `x-foresignal-scope: read`, `x-foresignal-permission:
    self.editions`, `x-foresignal-always-authenticated: true` (an API token is 401). Each
    description states `ownerUserId` is ignored and forced to the caller, and 404 unless the caller
    owns the edition.
- **No schema changed.** `BriefingInput`, `Briefing`, `BriefingScope`, `DeliveryTarget`,
  `BriefingRun`, `EditionSummary` are byte-identical to 2.1.0 (confirmed field-by-field). The delta
  is purely the four new operation objects, so `npm run generate` left **zero** `tsc` errors and no
  shim was needed (as in NP-001, unlike R2-001).

## What was built

### Spec + version plumbing
- `openapi/OpenAPI.json` re-vendored byte-for-byte (2.1.1); `openapi/VERSION` → `2.1.1` (trailing
  newline kept, confirmed with `xxd`); `src/api/generated/schema.ts` regenerated
  (openapi-typescript 7.13.0). No generated code hand-edited.
- Version-pin tests bumped to `2.1.1`: `src/api/testing/fixtures.ts` (`systemInfo` default +
  `version`), `src/app/App.test.tsx` (`backend` default, displayed version, mismatch copy),
  `src/state/capabilities.test.ts` (built-for + happy-path values). The deliberate-mismatch
  **backend-reported** values (`9.9.9`, `1.1.0`, `1.0.0`) were left intact so those tests still
  assert a genuine divergence. No unrelated `2.1.0` string remains in `src/` outside the generated
  schema (`grep` confirmed).

### API module (`src/editions/editionsApi.ts`)
Four functions over the new ops, plus `BriefingInput`/`Briefing` type exports:
`createMyEdition` (POST), `updateMyEdition` (PUT), `deleteMyEdition` (DELETE, 204 handled without
`unwrap`), `runMyEdition` (POST run). **`ownerUserId` is never sent** — the backend forces it to the
caller, so the client cannot assign another user's id.

### Permission (`src/auth/permissions.ts`)
`self.editions` added to `END_USER_PERMISSIONS` (the key now exists in the contract, so — unlike
NP-002, which found no such key and gated on sign-in — it is gated with the R2-006 `useCan()`
mechanism). Operator keys remain absent.

### Editor (`src/editions/EditionEditor.tsx`)
A create/edit form in the Editions area, reached by two new routes — `/editions/new` (create) and
`/editions/:briefingId/edit` (edit), both wired in `App.tsx` before the `:briefingId` reader route.
Gated three ways: anonymous → sign-in affordance; signed-in without `self.editions` → a read-only
message linking back to the reader; `self.editions` → the form. Fields map directly to
`BriefingInput`: name, enabled, schedule (cron), timezone, mode (digest/llm), output language
(BCP 47; blank → `null` = the owner's preference), instructions, feed/sources (one id per line →
`scope.sources`), **sections/record kinds** (one per line → `scope.kinds`), items-per-section
(`maxItemsPerKind`), two evidence toggles (`includeProvenance`/`includeCorroboration`, which drive
NP-002's reader badges), and a repeatable **output targets** editor (`deliveryTargets`: kind/format
+ optional channel id). On save it navigates to the new edition's reader (`Briefing.id`).

### List affordances (`src/editions/EditionsView.tsx`)
A **New edition** button and per-row **Edit** / **Run now** / **Delete** actions, all shown only to
a `self.editions` holder (a user without it keeps exactly the NP-002 read-only list + reader). Run
and delete call the API, toast the result, and bump a `useRead` version to refresh the list; delete
is behind a `window.confirm`.

## Contract facts that shaped the code (verified this session)

1. **openapi-typescript marks every `default`-bearing property as required** (non-optional) in the
   generated types. So `BriefingInput` requires `name, enabled, schedule, timezone, mode,
   maxItemsPerKind, includeProvenance, includeCorroboration`, and `BriefingScope` requires
   `includeHealth, includeAlertQuality`, even though the spec's `required` lists only `name,
   schedule` (and `DeliveryTarget` requires `kind, format`). `toInput()` therefore sets each
   defaulted field to the form value **or its documented backend default** (`UTC`, `digest`, `5`,
   `false`, `includeHealth: true`, `includeAlertQuality: false`) rather than omitting it. No
   behavior was invented — these are the spec's own defaults.
2. **The self-service surface has no full single-edition read.** `listMyEditions` returns
   `EditionSummary` (briefingId, name, enabled, schedule, timezone, outputLanguage, run metadata) —
   it does **not** carry scope, mode, sections or delivery targets. `GET /v1/briefings/{briefingId}`
   (`getBriefing`) does, but it is `intel.read` scope and **not** in this prompt's op list, so it was
   not used. See owner question 1.
3. **`updateMyEdition` is a PUT (replace), not a merge** (per its description + HTTP semantics). The
   edit form prefills only the summary-backed fields and shows a visible warning that saving replaces
   the edition's full configuration. See owner question 1.

## Tests written (not run)

- **`editionsApi.test.ts`** (+4 suites): `createMyEdition` (POSTs the body, asserts **no
  `ownerUserId`** is sent), `updateMyEdition` (PUTs to the id path, no `ownerUserId`),
  `deleteMyEdition` (resolves on 204, rejects on 404), `runMyEdition` (POSTs to the run path, returns
  the started run).
- **`EditionEditor.test.tsx`** (new, 4): create flow fills the form and asserts the sent input has no
  `ownerUserId`; edit flow prefills name + output language from the summary and shows the
  replace-warning; a user without `self.editions` gets the read-only message and no Create button; an
  anonymous visitor gets a sign-in link.
- **`EditionsView.test.tsx`** (+4): manage affordances (New edition / Edit / Run now / Delete) shown
  with `self.editions` and hidden without it; run-on-demand calls `runMyEdition`; delete (confirmed)
  calls `deleteMyEdition`.
- Version-pin tests in `App.test.tsx`, `capabilities.test.ts`, `fixtures.ts` updated to `2.1.1`.

## Checks

| Check                                                  | Result                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `npm run generate`                                     | Clean (openapi-typescript 7.13.0, ~1.5 s)                            |
| `npm run typecheck`                                    | Passed (0 errors; no shim required)                                  |
| `npm run lint`                                         | Passed                                                               |
| `npx prettier --check` (new + touched files)           | "All matched files use Prettier code style!"                         |
| `npm run build`                                        | Passed (pre-existing >500 kB chunk warning only, unchanged)          |
| `npm test`, `npm run e2e`, browser run                 | **Not run** (standing rule)                                          |
| Guard: `style/test_us_english.py` (project-wide sweep) | **Passed** — 14 tests OK in 193 s, incl. `test_no_british_spelling_survives_in_any_repository`; targeted grep of the touched files also clean |

## Not proven from outside

The compile-only gate turns `npm test`, `npm run e2e` and the browser run off, so **no real-device
proof was produced**: the create/edit form, the gating, and the run/delete row actions are verified
only by the written tests (not executed) and by the type/lint/build gates. A real-device pass —
create an edition → see it in the list and reader → run it → edit it → delete it, and the
no-permission and anonymous paths — remains to be run when the test freeze lifts.

## Owner questions

1. **Edit prefill is limited by the self-service surface.** `listMyEditions`/`EditionSummary` carry
   only name/enabled/schedule/timezone/outputLanguage; there is no self-service full read of an
   edition's `BriefingInput` (the only full read, `getBriefing`, is `intel.read` scope and outside
   this prompt's op list). Because `updateMyEdition` is a PUT that replaces, the edit form prefills
   those summary fields and warns that scope/mode/sections/targets revert to defaults unless
   re-entered. Options if this is not wanted: (a) add a `self.editions`-scoped **read** of a single
   edition's full input to the backend contract, or (b) have `updateMyEdition` merge rather than
   replace. Flag which.
2. **"Sections" mapped to `scope.kinds` + `maxItemsPerKind`.** `BriefingInput` has no `sections`
   field; the editor labels the record-kinds list "Sections / record kinds" and exposes
   items-per-section. Flag if "sections" meant a different field.
3. **Evidence toggles surfaced in the editor.** `includeProvenance`/`includeCorroboration` are
   exposed as checkboxes because they directly control NP-002's reader badges (and the generated type
   requires them). Flag if they should be hidden and always default to off.
4. **Delete uses `window.confirm`.** A plain browser confirm guards the destructive action rather
   than a custom modal; flag if a styled confirmation dialog is wanted.
5. **No real-device proof** (see above) — the standing test freeze blocked it.

Open questions from NP-001/NP-002 and the R2 reports keep their defaults (notably NP-002 Q1: the
reader renders Markdown, not `?format=html`; and NP-002 Q3: `/v1/k/{key}/site`,
`/v1/me/news-subscriptions`, `/v1/settings/translation` remain unconsumed — still out of scope here).
