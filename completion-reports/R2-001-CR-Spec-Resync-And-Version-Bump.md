# R2-001 — Completion Report: Spec Resync And Version Bump

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `12dab0538ba610c61246f8fc74facfe12d82db42`                                              |
| Run mode              | Attended; owner revised the R2-001 prompt (`120d0ef`) after the first run surfaced the real delta, then asked to re-run. Review gate after this prompt. |
| Screenshots           | None taken (compile-only; no screen changed).                                           |
| Mock comparison       | Not applicable: spec vendoring and a version string. No `design/` mockup is affected.   |

## The real delta (verified this session, 1.0.0 → 2.0.0)

Every figure below is from a command run this session against the git-`HEAD` vendored spec and the
backend's `../foresignal/docs/OpenAPI.json`; nothing is quoted from the prompt.

- **Counts.** 638 → 706 paths (68 added, 0 removed); 1094 → 1196 schemas (102 added, 0 removed).
  Command: `python3` over both files' `paths` / `components.schemas` key sets.
- **Byte-for-byte vendoring.** `cmp` exits 0; `md5sum` of source and vendored copy are identical
  (`d30c4835eff6f2040dd20247cce78ad8`).
- **`RuleQuality` rename** `labelled`/`labelledShare` → `labeled`/`labeledShare` confirmed in both
  the spec and the regenerated `schema.ts`. **Nothing in the client references `RuleQuality` or
  those fields** (`grep -rn "RuleQuality|labelledShare|..."` over `src/` excluding the generated
  file returned NONE), so that rename is inert.
- **The regenerate is NOT inert** (this is the correction the owner applied to the prompt). A clean
  `npm run generate` leaves **five** `tsc` errors across three files, from two 2.0.0 type changes:
  1. **`Relation.type` became `x-extensible-enum`.** `openapi-typescript` 7.13.0 does not recognize
     that vendor extension and renders the field as bare `string` (verified with a throwaway probe:
     `const x: Relation['type'] = 'not-a-relation-type'` compiles). That collapses the client's
     `RelationType = Relation['type']` from a closed union to `string`, which no longer fits the
     **still-closed** `GraphRequest.types` / `RelationInput.type` (20-value `enum`s). Breaks:
     `graphApi.ts` (the alias no longer feeds the graph call sites), `EvidenceGraph.tsx:97`,
     `GraphSidePanel.tsx:195`, and — surfaced only once the alias was fixed —
     `graphView.ts:217` and `:271` (mapping a wire edge/path relation type into `ViewEdge.type`).
  2. **`GET /v1/forecasts/calibration` widened** its 200 response from `$ref ForecastCalibration` to
     `oneOf [ForecastCalibration, ForecastNumericCalibration]` — a new `ForecastNumericCalibration`
     schema (`type: "numeric"`, `quantileReliability`, `pit`, `summary`). Breaks
     `getForecastCalibration`, typed to return only the bin-and-curve member.
- **Enum tightenings/wideners.** 16 `enum` → `x-extensible-enum` flips in all (not "14 other"; the
  owner's figure undercounts by the nested array-item enums). Besides `Relation.type` they are:
  `Entity.type`, `EntityKey.keyType`, `EntityLink.keyType`, `Forecast.forecasterType`,
  `Forecaster.type`, `ScorecardEntry.forecasterType`, the `*.event` enums
  (`ChannelType`/`Channel`/`NotificationDelivery`/`NotificationMessage`/`Notification`), the
  `*.action` enums (`IntelEventLogEntry`/`SituationTimelineEntry`/`NarrativeLogEntry`), and
  `CommonDependencies.dependencies[].paths[].relationTypes`. All but `Relation.type` compile as
  `string` today and are **not** read into a closed union anywhere (the clean typecheck proves it),
  so they are untouched here. Later prompts that consume them must accept unlisted values.
- **No enum member was removed.** The one apparent "removal" my diff reported is a `null` placeholder
  in the old `SituationTimelineEntry.action` (a nullable enum); the new one flipped to
  `x-extensible-enum` **and added** `edited`. So "0 members removed" holds in substance.

## The two shims (behavior-preserving)

- **`src/graph/graphApi.ts`.** `export type RelationType = Relation['type'];` →
  `export type RelationType = NonNullable<GraphRequest['types']>[number];` — the still-closed 20-value
  filter enum. A doc comment records why it no longer derives from the now-`string`
  `Relation['type']`, and that graceful handling of an unlisted wire relation type is R2-011's job.
  This restores the closed union `RELATION_TYPES`, `edgeFamily` and the graph call sites rely on.
- **`src/intel/forecastApi.ts`.** `getForecastCalibration` still returns `Promise<ForecastCalibration>`;
  the widened `oneOf` result is narrowed to that member with a documented cast
  (`... as Promise<ForecastCalibration>`). A doc comment notes that discriminating the
  `ForecastNumericCalibration` variant is R2-010's (it owns the calibration view).
- **Follow-on (same change, same remedy).** `src/graph/graphView.ts:217` and the common-dependencies
  edge at `:271` map a wire relation type (now `string`) into the closed `ViewEdge.type`
  (`RelationType`); each is narrowed with `as RelationType` and a one-line comment pointing back to
  the `Relation.type` note. The prompt licenses this ("narrow it to today's behavior the same way
  and record it in the CR — never invent new behavior").

No generated code was hand-edited. No new behavior was introduced: every shim preserves exactly what
the client did on 1.0.0.

## Version plumbing

- `openapi/VERSION` = `2.0.0` (trailing newline kept, matching the prior file).
- `SPEC_VERSION` (`src/app/session.ts`) reads it via `?raw` + `.trim()` → `'2.0.0'`.
- `checkVersion` (`src/state/capabilities.ts`) compares `SPEC_VERSION` to `getSystem`'s `apiVersion`;
  `VersionBanner` (`src/app/VersionBanner.tsx:9`) renders only when `version.mismatch`. With the live
  backend on 2.0.0 the two match, so no banner shows (`2.0.0 ↔ 2.0.0`). Verified by the code path and
  the happy-path App test (no `version-mismatch` element); not browser-verified (standing rule).

## Tests written (not run)

Only the version-pin tests were touched, to pin the client's *built-for* spec version to `2.0.0`:

- **`src/app/App.test.tsx`:** the happy-path backend default (`backend(apiVersion = '2.0.0')`), the
  displayed `backend-version` (`'2.0.0'`), and the mismatch copy (`built for API version 2.0.0, but
  the backend reports 9.9.9`). The differing backend value `9.9.9` is left as the deliberate mismatch.
- **`src/state/capabilities.test.ts`:** the `checkVersion` expected (built-for) value → `2.0.0`; the
  happy path matches `2.0.0 ↔ 2.0.0`; the mismatch test keeps a genuine divergence by having the
  backend report the older `1.0.0` against a built-for `2.0.0`.
- **`src/api/testing/fixtures.ts`:** `systemInfo`'s default `apiVersion` and `version` → `2.0.0`.

Every unrelated `1.0.0` was left untouched — `scorerVersion`, the `changepoint-cusum` detector
version, `InformationValue 1.0.0`, and the backend *software*-version stubs in `client.test.ts` /
`deviceHeader.test.ts` (those are `SystemInfo.version`, not the API version).

## Checks

| Check                                                         | Result                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run generate`                                            | Clean (openapi-typescript 7.13.0, 1.5 s)                                                        |
| `npm run typecheck`                                           | Passed (0 errors; was 5 before the shims)                                                       |
| `npm run lint`                                                | Passed                                                                                          |
| `npx prettier --check src e2e scripts`                        | "All matched files use Prettier code style!"                                                    |
| `npm run build`                                               | Passed. `index` 904.95 kB (272.65 kB gzip); the >500 kB chunk warning is pre-existing (unchanged) |
| `npm test`, `npm run e2e`, browser run                        | **Not run** (standing rule)                                                                     |
| Guard: `check_us_english.py` over the six hand-edited files   | 2 hits, both `licence` at `App.test.tsx:214,219` — the `Attribution.licence` **wire key**, pre-existing (not in this diff), left as is per the rule |
| Guard: `check_us_english.py` over this CR                     | 5 hits, all wire-key references left verbatim per the "never correct a wire key" rule: 3 × `labelled`/`labelledShare` (the old `RuleQuality` field names being renamed) and 2 × `licence` (the `Attribution.licence` key) |

## Compared to the mock

Not applicable: this prompt vendors a contract and bumps a version string. No screen changed, so no
`design/` mockup is in scope.

## Owner questions

1. **`ForecastNumericCalibration` deferred to R2-010.** `getForecastCalibration` currently discards
   the numeric variant via a documented cast. R2-010 (Intel Calibration And Corroboration) should
   discriminate `type: "numeric"` and render quantile reliability / PIT. Default in place: the client
   reads only the bin-and-curve member, as on 1.0.0.
2. **16 `enum` → `x-extensible-enum` properties now typed `string`.** Listed above. They compile and
   are inert today. Each later prompt that consumes one (e.g. R2-011 for `Relation.type`, and whatever
   reads `Entity.type`, the `*.event` / `*.action` enums) must tolerate a value not in the vendored
   list, per the contract's own note. No client-wide "extensible enum" helper was added here, to avoid
   inventing a pattern ahead of the prompt that needs it — flag if you want one.
3. **`RELATION_TYPES` still lists 15 values**, not the 20 the 2.0.0 filter enum now carries (the 5
   ownership edges `owns`/`controls`/`officer-of`/`beneficial-owner`/`affiliated-with` are omitted
   from the client's dropdown). Adding them to the UI is R2-011's scope. Default in place: 15.

Questions carried by R2-000 (external analysis `requestAnalysis`/`analysisCallback`; prompt templates
`listPromptTemplates`) remain excluded by default. Questions still open from earlier reports keep
their defaults.
