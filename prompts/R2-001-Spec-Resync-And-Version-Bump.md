# R2-001 — Spec Resync And Version Bump

**Goal.** Re-vendor the backend's current OpenAPI (`2.0.0`) as the client's single contract,
regenerate the typed surface, and bring the version-aware code, the two type-level breaks the
regenerate exposes, and the tests in step — so the client compiles cleanly on the new contract
before any feature prompt builds on it.

**Read first.** 034-CR (Build-And-Deploy), 038-CR; README §"OpenAPI is the only backend reference".
Backend contract: `../foresignal/docs/OpenAPI.json` (`info.version` 2.0.0), vendored to
`openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/system` [`getSystem`], `GET /v1/contract` [`getContract`] — the live version/contract the
  client checks against `SPEC_VERSION`. No new calls; this prompt moves the contract.

**The delta (verified, 1.0.0 → 2.0.0).** 638→706 paths (68 added, 0 removed), 1094→1196 schemas
(102 added, 0 removed), 0 enum members removed. The **wire** contract is additive. The **generated
TypeScript** is not fully inert — the regenerate surfaces exactly three compile errors from two
2.0.0 type changes, each fixed below:
- `Relation.type` became `x-extensible-enum`, which `openapi-typescript` renders as bare `string`
  (proven in the generated `schema.ts`). That collapses `RelationType = Relation['type']` to
  `string`, which no longer fits the still-closed `GraphRequest.types` / `RelationInput.type`
  (breaks the two graph call sites).
- `GET /v1/forecasts/calibration` widened its response from `ForecastCalibration` to
  `oneOf [ForecastCalibration, ForecastNumericCalibration]` (breaks `getForecastCalibration`).
- `RuleQuality` renamed `labelled`/`labelledShare` → `labeled`; nothing in the client reads those,
  so that one is inert.
(14 other properties also flipped `enum` → `x-extensible-enum`, e.g. `Entity.type`,
`Forecast.forecasterType`, the `*.event`/`*.action` enums; they compile as `string` today and are
not touched here — later prompts that consume them must accept unlisted values.)

**Build.**
- Replace `openapi/OpenAPI.json` with a byte-for-byte copy of `../foresignal/docs/OpenAPI.json`, and
  record `openapi/VERSION` = `2.0.0`. (This is the vendoring the README describes — a straight copy.)
- `npm run generate` → regenerate `src/api/generated/schema.ts`. **Never hand-edit** it.
- Apply the two behavior-preserving compile shims:
  - `src/graph/graphApi.ts`: change `export type RelationType = Relation['type'];` to
    `export type RelationType = NonNullable<GraphRequest['types']>[number];` (the still-closed
    20-value filter enum), and document why it no longer derives from the now-`string`
    `Relation['type']`. This restores the closed union `RELATION_TYPES`, `edgeFamily` and the two
    graph call sites need; graceful handling of an unlisted wire relation type is R2-011's job.
  - `src/intel/forecastApi.ts`: `getForecastCalibration` keeps returning `ForecastCalibration` for
    now — narrow the widened union to that member (a documented cast), noting that discriminating
    the `ForecastNumericCalibration` variant belongs to R2-010 (it shares that schema).
  - If `npm run typecheck` surfaces any further error from the regenerate, narrow it to today's
    behavior the same way and record it in the CR — never invent new behavior.
- Confirm the version plumbing: `SPEC_VERSION` (`src/app/session.ts`, from `openapi/VERSION`) now
  reads `2.0.0`; `checkVersion` (`src/state/capabilities.ts`) compares it to `getSystem`'s version
  and the `VersionBanner` shows a match (`2.0.0` ↔ `2.0.0`).
- Update **only** the tests that pin the client's *built-for spec version* to `2.0.0`:
  `src/app/App.test.tsx` (happy-path backend version + the "built for API version …" mismatch copy),
  `src/state/capabilities.test.ts` (the `checkVersion` expected value), `src/api/testing/fixtures.ts`
  (`systemInfo`'s default `apiVersion` and value). **Leave every unrelated `1.0.0` untouched** —
  `scorerVersion`, the `changepoint-cusum` detector version, `InformationValue 1.0.0` are domain
  data, not the API version.

**Done when.** `npm run generate` is clean; the two shims are applied; `npm run typecheck`,
`npm run lint` and `npm run build` pass against the 2.0.0 contract; the version banner reports no
mismatch; the updated version tests are written (not run). The CR records the **real** delta above
(not "inert"), the two shims, and the owner questions.

**Commit.** `R2-001: Spec Resync And Version Bump`;
`completion-reports/R2-001-CR-Spec-Resync-And-Version-Bump.md` (hash + owner questions — at least:
the `ForecastNumericCalibration` variant deferred to R2-010, and the 14 enum→`x-extensible-enum`
properties now typed `string`).
