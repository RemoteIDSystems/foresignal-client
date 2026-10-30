# R2-012 — Resync to OpenAPI 2.1.0

**Goal.** Bring the client onto the backend's **2.1.0** contract (the automated-newspaper surface —
editions, hosted site, provenance) by re-vendoring the spec and regenerating the typed surface, so
the edition view (R2-013) compiles against the real contract. Mirrors R2-001.

**Prerequisite (hard stop).** This prompt vendors the backend's **2.1.0** spec, which the backend
Automated Newspaper set (`foresignal` `R2-028`…`R2-034`) produces. Before doing anything, check
`../foresignal/docs/OpenAPI.json` `info.version`: if it is **not** `2.1.0`, that set is not merged
yet — **stop immediately**, write `completion-reports/RUN-STATUS.md` recording that the backend 2.1.0
dependency is unmet, and do **not** vendor the older spec or bump `VERSION`. Only proceed when the
vendored source reads `2.1.0`.

**Read first.** R2-001-CR (the 2.0.0 resync and its compile shims); README §"OpenAPI is the only
backend reference". Backend contract: `../foresignal/docs/OpenAPI.json` (`info.version` 2.1.0, ops
active after backend R2-034), vendored to `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/system` [`getSystem`], `GET /v1/contract` [`getContract`] — the live version the client
  checks against `SPEC_VERSION`. No new calls here.

**Build.**
- Replace `openapi/OpenAPI.json` with a byte-for-byte copy of `../foresignal/docs/OpenAPI.json`
  (2.1.0); record `openapi/VERSION` = `2.1.0`.
- `npm run generate` → regenerate `src/api/generated/schema.ts` (never hand-edited).
- The 1.0.0→2.0.0 delta was additive; 2.0.0→2.1.0 is additive too (new editions/translation/site
  schemas, no removals). If `npm run typecheck` surfaces any new error from the regenerate, narrow it
  to today's behavior as R2-001 did and record it; do not invent behavior.
- Update only the tests that pin the client's built-for spec version to `2.1.0` (the `App.test.tsx`
  backend-version happy path + mismatch copy, `capabilities.test.ts`, `api/testing/fixtures.ts`),
  leaving unrelated version strings untouched.

**Done when.** `openapi/VERSION` is `2.1.0`; `npm run generate` clean; `npm run typecheck`/`lint`/
`build` pass; the version banner reads 2.1.0 ↔ 2.1.0; the version tests are written (not run).

**Commit.** `R2-012: Resync To OpenAPI 2.1.0`;
`completion-reports/R2-012-CR-Resync-OpenAPI-2.1.0.md` (hash + owner questions).
