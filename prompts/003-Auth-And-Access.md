# 003 — Auth And Access

**Goal.** Support the backend's access modes — open reads, bearer tokens, stream tickets and tile
keys — and bootstrap capabilities, so later prompts never special-case auth.

**Read first.** 002-CR; [Architecture.md](../docs/Architecture.md) §4.2. Backend contract:
`openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/system` [`getSystem`], `GET /v1/contract` [`getContract`] — capabilities/limits, contract versions.
- `POST /v1/stream-tickets` [`createStreamTicket`] — short-lived `?ticket=` for SSE/tile URLs.
- `POST /v1/tile-keys` [`createTileKey`] — header-less `/v1/k/{key}/…` access when reads are closed.
- `POST /v1/pairing/claim` [`claimPairingCode`] — token delivery via a pairing code.
- `PUT /v1/tokens/current/device` [`updateCurrentTokenDevice`] — report device metadata.

**Build.**
- `src/api/auth.ts`: a token store (persisted client-side) with set/clear; when absent the client
  relies on open reads, when present it sends the bearer.
- `src/state/capabilities.ts`: on startup fetch `getSystem` + `getContract`; expose
  `useCapabilities()` (features, limits, contract versions). Surface a mismatch between
  `openapi/VERSION` and the live system version (do not silently tolerate it).
- `src/api/tickets.ts`: mint + cache (within TTL) a stream/tile ticket; helper to append `?ticket=`.
- `src/api/tileKey.ts`: mint a tile key and a `keyed(url)` rewriter (`/v1/ → /v1/k/{key}/`).
- `src/lib/deviceId.ts`: generate + persist a UUID; send `Foresignal-Device-Id` on inbox calls;
  call `updateCurrentTokenDevice` when a token is present.
- A minimal Settings panel to paste a token or claim a pairing code.

**Done when.** With open reads, the app can call `getSystem` with no token; with a token the bearer
is sent; ticket, tile-key `keyed()`, and device-id helpers are unit-tested.

**Commit.** `003: Auth And Access`; `completion-reports/003-CR-Auth-And-Access.md` (hash + owner questions).
