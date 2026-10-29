# R2-001 — Spec Resync And Version Bump

**Goal.** Re-vendor the backend's current OpenAPI (`2.0.0`) as the client's single contract,
regenerate the typed surface, and bring the version-aware code and tests in step — so the client
compiles cleanly on the new contract before any feature prompt builds on it.

**Read first.** 034-CR (Build-And-Deploy), 038-CR; README §"OpenAPI is the only backend reference".
Backend contract: `../foresignal/docs/OpenAPI.json` (`info.version` 2.0.0), vendored to
`openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/system` [`getSystem`], `GET /v1/contract` [`getContract`] — the live version/contract the
  client already checks against `SPEC_VERSION`. No new calls; this prompt only moves the contract.

**Build.**
- Replace `openapi/OpenAPI.json` with a byte-for-byte copy of `../foresignal/docs/OpenAPI.json`, and
  record `openapi/VERSION` = `2.0.0`. (This is the vendoring step the README describes; the file is
  a straight copy, not transformed.)
- `npm run generate` → regenerate `src/api/generated/schema.ts`. **Never hand-edit** it.
- Confirm the version plumbing: `SPEC_VERSION` (`src/app/session.ts`, read from `openapi/VERSION`)
  now reads `2.0.0`; `checkVersion` (`src/state/capabilities.ts`) compares it to `getSystem`'s live
  version, and the `VersionBanner` shows a match (`2.0.0` ↔ `2.0.0`), not a mismatch.
- Update **only** the tests that pin the client's *built-for spec version* to `2.0.0`:
  `src/app/App.test.tsx` (the happy-path backend version and the "built for API version …, but the
  backend reports …" mismatch copy), `src/state/capabilities.test.ts` (the `checkVersion` expected
  value), and `src/api/testing/fixtures.ts` (`systemInfo`'s default `apiVersion` and value).
  **Leave every unrelated `1.0.0` untouched** — `scorerVersion`, the `changepoint-cusum` detector
  version, `InformationValue 1.0.0` and similar are domain data, not the API version.

**Done when.** `npm run generate` is clean; `npm run typecheck`, `npm run lint` and `npm run build`
pass against the 2.0.0 contract; the version banner reports no mismatch; the updated version tests
are written (not run). Note in the CR, as a verified fact, that the only breaking shared-schema
change from 1.0.0→2.0.0 is `RuleQuality` (`labelled`/`labelledShare` → `labeled`) and that nothing
in the client reads those fields, so the regenerate is inert there (638→706 paths, 1094→1196
schemas, 0 removed either way).

**Commit.** `R2-001: Spec Resync And Version Bump`;
`completion-reports/R2-001-CR-Spec-Resync-And-Version-Bump.md` (hash + owner questions).
