# 003 — Completion Report: Auth And Access

| Field                 | Value                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| Status                | Complete                                                               |
| Implementation commit | `337ba02652c75da69dc929fa0cfed84481237063`                             |
| Vendored OpenAPI      | `1.0.0`, unchanged (`cmp` against the backend: identical)              |
| Screenshot            | `review/003-auth-and-access.png` (dev server against the live backend) |

## What was built

- **`src/api/auth.ts`.** `createTokenStore()` keeps the bearer token in `localStorage`
  (`foresignal.token`), with `get`/`set`/`clear`/`subscribe`. Setting a blank value clears it.
  With no token, calls rely on open reads; with one, every call sends `Authorization: Bearer …`.
- **`src/state/capabilities.ts`.** `useCapabilities()` loads `getSystem` and `getContract` at
  startup and again on every token change: features, limits, security, and the contract,
  context-schema and deep-link versions. `checkVersion` compares `openapi/VERSION` with the live
  `apiVersion` (the spec's own `info.version`). A difference, or a missing version, shows a
  visible banner (`VersionBanner`).
- **`src/api/tickets.ts`.** `createTicketSource` uses `createStreamTicket`.
  - **Tile tickets** are cached and reused until 30 s before `expiresAt`. They are minted again
    after `invalidate()` (for use after a 401) or when the token changes, and concurrent callers
    share one mint.
  - **Stream tickets are minted fresh for every connection and never cached.** The spec allows
    one concurrent stream per stream ticket, so sharing one between, say, the events and alerts
    streams would break. This is the one place I read the prompt's "mint + cache" as applying
    to tile tickets only.
  - Without a token, both return `null`: the spec says tickets always need a token, and open
    reads need no ticket.
  - `withTicket(url, ticket)` appends `?ticket=` and keeps any existing query and fragment.
- **`src/api/tileKey.ts`.** `mintTileKey` uses `createTileKey`. `keyed(url, key)` rewrites
  `/v1/…` to `/v1/k/{key}/…` for relative and absolute URLs, and leaves already-keyed or non-API
  URLs alone.
- **`src/lib/deviceId.ts`.** A UUID generated once and persisted (`foresignal.deviceId`); an
  invalid stored value is replaced. `describeDevice()` builds `DeviceInfo` (`platform: web`, the
  browser platform in the name, the build version). The client sends `Foresignal-Device-Id` on
  exactly the six operations whose spec declares it (5 inbox operations + `updatePresence`). A
  test reads the spec and fails if that list drifts.
- **`updateCurrentTokenDevice`** is called whenever a token is present (startup and every token
  change); a failure is logged.
- **Settings panel.** Shows the backend status and versions. It lets you paste, save or clear a
  token, and claim a pairing code (`claimPairingCode`, sending `DeviceInfo`; the returned token is
  stored). Errors show the problem code and detail.
- **`src/app/session.ts`.** Wires the token store, API client, tickets and capabilities in one
  place, so later prompts don't need to special-case auth.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, `npx prettier --check .`: pass.
- `npm test`: 13 files, 58 tests, pass, with no warnings in the output. They cover:
  - the token store
  - device-id generation and persistence, and the device header on inbox calls only
  - the device-header list compared against the spec
  - tickets: none without a token, tile caching and reuse, shared mint, re-mint near expiry,
    after `invalidate` and on token change, and a fresh stream ticket every time
  - `withTicket` and `keyed`
  - `mintTileKey`
  - capabilities: ready, mismatch and error
  - App: open reads with no `Authorization`; saving a token sends the bearer and reports the
    device; the mismatch banner; claiming a pairing code
- The spec-typed mock caught a wrong field I'd written (`unreadUrgent`; the spec's field is
  `unreadCritical`).
- **From outside, in a real browser** (Playwright and Chromium against `npm run dev` with
  `VITE_FORESIGNAL_BASE_URL=http://localhost:8080`, the live backend):
  - With no token, the page showed backend version `1.0.0`, API `1.0.0` (built for `1.0.0`),
    contract `1.5`, and no mismatch banner. The `/v1/system` request carried no `Authorization`.
  - After saving `fsr_not_a_real_token`, the next `/v1/system` request carried
    `Bearer fsr_not_a_real_token`, and the panel showed
    `Error: 401 · UNAUTHORIZED · The presented token is not valid.`
  - Clearing the token went back to open reads (no header; version 1.0.0 again).
  - No page errors.
- US English: no hits in files this prompt wrote.

## Compared to the mockups

This is a functional, unstyled panel. No mockup shows Settings; it is restyled into the shell in 004.

## Owner questions (none blocking 004)

1. **The live backend doesn't report its open-reads posture.** `getSystem` defines an optional
   `security.openReads`, but the running backend's response has no `security` key (keys returned:
   `apiVersion, features, limits, mode, startedAt, status, uptimeSeconds, version`). The panel
   shows "not reported". Is `security` only returned to some callers, or is it missing?
2. **Dev CORS is narrower than the API.** This isn't in the OpenAPI; it was observed against the
   running backend from origin `http://localhost:5179`:
   - The preflight's `Access-Control-Allow-Headers` doesn't list `Foresignal-Device-Id` or
     `If-Match`.
   - A `PATCH` preflight returns no `Access-Control-Allow-Origin`.

   In the dev setup (cross-origin), the browser will therefore block inbox calls with the device
   header (prompt 029), `updateEventStreamFilter` (PATCH, prompt 011) and
   `patchWorkspaceContext` (PATCH + `If-Match`, prompt 025). Production is same-origin and
   unaffected. Should the backend's CORS allow these, or should dev run same-origin?

3. **Tile keys need the `agent` scope.** `createTileKey` requires `agent`, so a user holding only
   a `read` token can't mint one, and closed-reads map access for them relies on tile tickets.
   Is that intended?
