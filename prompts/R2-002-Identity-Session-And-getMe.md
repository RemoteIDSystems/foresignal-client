# R2-002 — Identity, Session And getMe

**Goal.** A session-based identity layer beside the existing API-token store: accept `fss_` session
bearers, hold the signed-in principal with its effective permissions, scopes and expiry, and
rehydrate it on reload from `getMe`. No sign-in UI yet — this is the plumbing every later `R2-*`
prompt reads.

**Read first.** R2-001-CR; 003-CR (Auth-And-Access); [Architecture.md](../docs/Architecture.md) §4.
Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/me` [`getMe`] → `Me` — the calling principal: `user`, `permissions[]`, `scopes[]`,
  `groups`, `notificationPreferences`, `defaultTlp`. This is the single rehydrate call.

**Build.**
- `src/api/auth.ts`: keep the bearer-token store as is; add a **session token** kind (bearer
  starting `fss_`) persisted client-side under its own key. The API client (`src/api/client.ts`)
  sends whichever credential is present, preferring a session over a pasted API token.
- `src/app/session.ts`: on startup, when a session token is stored, call `getMe` and hold the
  resulting `Me`. Expose the signed-in principal (or `null`) and its `permissions`/`scopes` through
  a store + `useMe()` and `usePermissions()` hooks, mirroring `useToken`/`useSyncExternalStore`.
- Session lifetime: carry `expiresAt`/`idleExpiresAt` (from the login `SessionToken`, consumed in
  R2-003); a `401` on a request made with a session clears the session and drops the app to
  anonymous. Clearing the session must not clear a separately-pasted API token, and vice versa.
- Anonymous open reads keep working when neither credential is present (`useMe()` → `null`).

**Done when.** With a stored session token the app rehydrates identity from `getMe` and exposes the
principal's permissions and scopes; a `401` or an explicit clear returns the app to anonymous;
pasting an API token still works. Unit-tested against an in-process mock of `getMe`; compile-only
(`typecheck`/`lint`/`build`), tests written not run.

**Commit.** `R2-002: Identity, Session And getMe`;
`completion-reports/R2-002-CR-Identity-Session-And-getMe.md` (hash + owner questions).
