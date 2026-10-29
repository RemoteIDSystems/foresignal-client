# R2-002 — Completion Report: Identity, Session And getMe

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `29916d1b11f54bd1e8885363f6b44dd8ebc35966`                                              |
| Run mode              | Unattended batch (owner: "continue, and going forward do not wait"). No pause at this gate. |
| Screenshots           | None (plumbing only; no sign-in UI yet — that is R2-003).                                |
| Mock comparison       | Not applicable: no screen changed.                                                      |

## What was built

A session-based identity layer that sits beside the existing pasted-API-token store; the single
backend call is `getMe` (`GET /v1/me` → `Me`).

- **`src/api/auth.ts` — `SessionStore`.** Holds a `SessionCredential` (`{ token, expiresAt?,
  idleExpiresAt? }`), persisted as JSON under `foresignal.session` (`SESSION_STORAGE_KEY`),
  **separate** from the API token's `foresignal.token`. `SESSION_TOKEN_PREFIX = 'fss_'` names the
  login-session bearer kind. `expiresAt`/`idleExpiresAt` come from the login `SessionToken` and are
  carried for R2-003 to set and the app to honor; a credential rehydrated from storage may lack
  them. A malformed stored value, or one with no string `token`, reads as signed out.
- **`src/api/me.ts` — `PrincipalStore`.** A subscribable holder of the signed-in `Me` (or `null`).
  `load(client)` fetches `getMe` and publishes the `Me`; a failed load (invalid/expired session, or
  a backend that refuses it) publishes `null` (anonymous). A generation counter makes `load` safe to
  call repeatedly and makes `clear()` supersede any in-flight load.
- **`src/api/useMe.ts` — hooks.** `useMe()` returns `Me | null` (and `null` outside the app shell,
  no provider), `usePermissions()` returns `Me.permissions ?? []`. Both mirror `useToken`
  (`useSyncExternalStore` over a context store). `PrincipalStoreContext` is provided by `AppShell`.
- **`src/api/client.ts` — `onUnauthorized`.** A new option called with the originating `Request`
  whenever the backend answers `401` (an `onResponse` middleware). The client itself takes no
  action; the session layer decides.
- **`src/app/session.ts` — the wiring.**
  - `getBearer = () => sessions.get()?.token ?? tokens.get()` — **a session bearer is preferred
    over a pasted API token.** This getter is used by the API client and by every authenticated
    surface built here (tickets, the change stream, alerts, inbox, Web Push), so a session user
    authenticates everywhere.
  - `onUnauthorized` clears the session **only** when the 401's request carried the current
    session's bearer (`Authorization: Bearer <session token>`); a pasted API token is untouched, and
    a 401 on an API-token request leaves the session alone.
  - On startup and on every credential change (either store), `refresh()` reconnects the stream,
    restarts alerts/inbox, reloads capabilities, and rehydrates the principal: `getMe` is called
    while a session is present, and the principal is cleared to `null` otherwise. Anonymous open
    reads keep working when neither credential is present (`useMe()` → `null`).
  - `reportDevice` stays gated on the **API token** (`tokens.get()`), unchanged — see decision 2.
  - `Session` now exposes `sessions: SessionStore` and `principal: PrincipalStore`.
- **`src/app/AppShell.tsx`** provides `PrincipalStoreContext` around the shell.
- **`src/api/testing/fixtures.ts`** gains `me(overrides)` — a minimal valid `Me` (person principal,
  active user, read token) with injectable `permissions`/`scopes`.

No generated code was touched.

## How `Me` is shaped (verified against `openapi/OpenAPI.json`)

`Me` requires `principal`, `token`, `scopes`, `groups`, `notificationPreferences`; `user`,
`permissions` and `defaultTlp` are optional. `Me.permissions` is documented "present only for a
login session (R2-003)", so `usePermissions()` defaults to `[]`. `Me.scopes` is a closed
`("read"|"agent"|"admin")[]` (the fixture's `scopes` override is typed from the schema, not
`string[]`). `Principal.kind` is `"agent"|"person"|"service"` (the fixture uses `person`).

## Tests written (not run)

- **`src/api/auth.test.ts`** (+5): the session store starts signed out; persists/restores a
  credential as JSON; treats a malformed or token-less stored value as signed out; clears the
  stored value; notifies on every set and clear.
- **`src/api/me.test.ts`** (new, 7), against the in-process `getMe` mock:
  - the principal store loads `getMe` into the principal (permissions, scopes, `principal.handle`),
    notifying once;
  - a failed `getMe` reads as anonymous (`null`);
  - `clear()` supersedes an in-flight load;
  - the exact `getBearer`/`onUnauthorized` wiring `createSession` uses: the session bearer is
    preferred over a pasted API token; a 401 made with the session clears it and leaves the API
    token intact; once the session is gone the API token authenticates; a 401 made with a different
    credential does not clear the session.

## Checks

| Check                                                        | Result                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `npm run typecheck`                                          | Passed                                                             |
| `npm run lint`                                               | Passed                                                             |
| `npx prettier --check src e2e scripts`                       | "All matched files use Prettier code style!"                       |
| `npm run build`                                              | Passed (pre-existing >500 kB chunk warning only)                   |
| `npm test`, `npm run e2e`, browser run                       | **Not run** (standing rule)                                        |
| Guard: `check_us_english.py` over the 9 new/changed files    | 0 British spellings                                                |

## Compared to the mock

Not applicable: this prompt is identity plumbing with no UI.

## Decisions taken (unattended)

1. **`getBearer` is used for every authenticated surface, not only the REST client.** The prompt
   names "the API client"; a session user with no pasted API token would otherwise fail stream/tile
   authentication. Preferring the session everywhere is the behavior-correct reading of "sends
   whichever credential is present." Flag if streams should stay API-token-only.
2. **`reportDevice` stays gated on the pasted API token**, not `getBearer`. `updateCurrentTokenDevice`
   (`PUT /v1/tokens/current/device`) is about an API token's device; firing it under a session that
   the endpoint might reject would 401 and — through the new handler — wrongly clear a valid session.
   Keeping today's gate avoids that. Owner question if device reporting should cover sessions.
3. **The principal is only loaded while a session token is present.** `getMe` may also answer for an
   anonymous caller under open reads, but the prompt ties rehydrate to a stored session, and
   `useMe()` → `null` is the anonymous contract. Not calling `getMe` anonymously also avoids a
   needless request on every open-reads page load.
4. **`useMe()` returns the whole `Me`**, not just `Principal`, so later prompts read `user`,
   `scopes`, `permissions`, `groups`, `notificationPreferences` and `defaultTlp` from one hook.

## Owner questions

1. **Streams/tiles under a session** (decision 1): preferred everywhere by default — confirm or
   restrict to the REST client.
2. **Device reporting under a session** (decision 2): off by default — should a session report its
   device too, and if so via which operation?

Questions carried from R2-001 (ForecastNumericCalibration → R2-010; the 16 now-`string` extensible
enums; `RELATION_TYPES` at 15) and earlier keep their defaults.
