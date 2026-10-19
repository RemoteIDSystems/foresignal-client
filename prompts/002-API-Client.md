# 002 — API Client

**Goal.** A typed API layer generated from the vendored OpenAPI, wrapped with base URL, the
ProblemDetail error model, and `Retry-After` handling.

**Read first.** 001-CR; [Architecture.md](../docs/Architecture.md) §4. Backend contract:
`openapi/OpenAPI.json` (vendored from `foresignal/docs/OpenAPI.json`).

**Backend (OpenAPI only).**
- `GET /v1/system` [`getSystem`] and `GET /v1/contract` [`getContract`] — used as the smoke calls.

**Build.**
- Add `openapi-typescript` (dev) and `openapi-fetch`. Wire `npm run generate` →
  `openapi-typescript openapi/OpenAPI.json -o src/api/generated/schema.ts`. **Never hand-edit** the
  generated file.
- `src/api/client.ts`: `createForesignalClient({ baseUrl, getToken })` over openapi-fetch —
  attaches `Authorization: Bearer …` when a token is present, sets `Accept`, and maps any
  ProblemDetail (RFC 9457) response to a typed `FsError { status, code, title, detail, retryAfter }`.
- `src/api/retry.ts`: a bounded retry for idempotent GETs honoring `Retry-After` on `503`
  (`RENDER_BUSY`) and `429`.
- `src/api/paging.ts`: a cursor helper for `nextCursor`-style pagination (iterate pages lazily).
- Tests (Vitest): type-check the generated schema compiles; one happy-path call (`getSystem`) and
  one ProblemDetail → `FsError` mapping, against an in-process mock server built from the spec.

**Done when.** `npm run generate` produces types; the client compiles; `npm run typecheck`/`test`
pass; `FsError` mapping and `Retry-After` retry are covered.

**Commit.** `002: API Client`; write `completion-reports/002-CR-API-Client.md` with the commit hash
and any OpenAPI gaps found (owner questions).
