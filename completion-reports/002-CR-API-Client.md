# 002 — Completion Report: API Client

| Field                 | Value                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                  |
| Implementation commit | `73e5720c8bbc274ccd3f7a516bc2ff39e49162be`                                                |
| Vendored OpenAPI      | `1.0.0`, unchanged since 001 (`cmp` against the backend: identical)                       |
| Live backend          | `getSystem` → version `1.0.0` (matches `openapi/VERSION`); `getContract` → contract `1.5` |
| Screenshot            | `review/002-api-client.png` (no UI change in this prompt)                                 |

## What was built

- **Generation.** `npm run generate` runs openapi-typescript 7.13.0 over `openapi/OpenAPI.json`
  into `src/api/generated/schema.ts` (89,321 lines, about 1.6 s). The file is never hand-edited
  and is excluded from ESLint and Prettier.
- **`src/api/client.ts`.** `createForesignalClient({ baseUrl, getToken, retry?, fetch? })` over
  openapi-fetch 0.17.0. It sets `Accept: application/json, application/problem+json` unless the
  caller set one, and adds `Authorization: Bearer …` only when `getToken()` returns a token.
  `unwrap(call)` returns the data, or throws an `FsError` for any non-2xx response.
- **`src/api/errors.ts`.** `FsError { status, code, title, detail, retryAfter, problem }`. It is
  built from the spec's `Problem` schema (required: `title`, `status`). A non-problem failure
  (for example a proxy's HTML 502) maps from the status and status text alone. `retryAfter` uses
  the `Retry-After` header first, then the problem's `retryAfterSeconds`.
- **`src/api/retry.ts`.** A bounded retry, used by default. It applies only to `GET`/`HEAD`, only
  on `429`/`503`, and only when a whole-seconds `Retry-After` is present (the spec declares it as
  integer seconds on all 455 declarations). The defaults are 3 attempts and at most 30 s of wait.
  The wait is abortable through the request's signal.
- **`src/api/paging.ts`.** `pages()` and `items()` are lazy async iterators over the spec's
  `{ items, nextCursor }` page shape, which 107 cursor-paged operations use (plus `listRecords`
  through `RecordPage`).
- **Mock backend.** `src/api/testing/mock-server.ts` is MSW 3.0.3 with openapi-msw 2.1.0, its
  handlers typed from the generated `paths`. A handler for a path, status or body that isn't in
  the spec fails `npm run typecheck`. This was checked: a temporary handler with
  `version: 1` failed with `TS2322`.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`: pass. `npx prettier --check .`: clean.
- `npm test`: 7 files, 30 tests, pass. Coverage: `getSystem` happy path; the auth and Accept
  headers; ProblemDetail → `FsError` (`getContract` 401); a 429 retried per `Retry-After`, then a
  200; `retryAfter` reported once retries run out; a non-problem 502; the retry rules (non-GET,
  no header, wait over the cap, other statuses, abort); lazy paging; and compile-time checks that
  the generated schema has `getSystem`/`getContract`/`Problem`.
- **Against the live backend** (`localhost:8080`, temporary test, not committed): the client read
  `getSystem` and `getContract` without a token (open reads). A bad object ref came back as a real
  `400 OBJECT_REF_INVALID` problem and mapped to `FsError` with `code`, `detail` and the field
  error intact.
- US English: no hits in files this prompt wrote. The generated schema carries 777 hits copied
  from the spec's descriptions. It is generated, so it is left as-is.

## Compared to the mockups

No UI in this prompt. The page is unchanged from 001.

## Owner questions (none blocking 002)

1. **`listObjectAnnotations` paging.** `GET /v1/objects/{ref}/annotations` accepts a `cursor`
   described as "from a previous response's nextCursor", but its 200 response is a bare array
   (`Annotation[]` or `AnnotationThread[]`) with no `nextCursor` field and no `Link` header. As
   specified, a client can't get past the first page. This matters for prompt 026.
2. **`Retry-After` as an HTTP date.** The spec only declares integer seconds, so that is all the
   client honors; an HTTP-date value is not retried. Say if the backend ever sends dates.
