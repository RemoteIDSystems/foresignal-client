# R2-008 — Account Sessions And Personal Tokens

**Goal.** A user's security page: see and revoke their active sign-in sessions, and create, list and
revoke their personal API tokens.

**Read first.** R2-007-CR. Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/auth/sessions` [`listSessions`] → `SessionPage` (`Session`: `current`, `createdAt`,
  `lastSeenAt`, `expiresAt`, `idleExpiresAt`, `userAgent`, `ipAddress`).
- `DELETE /v1/auth/sessions/{id}` [`revokeSession`] → 204; `DELETE /v1/auth/sessions`
  [`revokeAllSessions`] → 204.
- `GET /v1/me/tokens` [`listMyTokens`] → `ApiToken[]`; `POST /v1/me/tokens` [`createMyToken`] — body
  `ApiTokenInput` (`name`, `scope`, optional `expiresAt`) → `ApiTokenCreated`;
  `DELETE /v1/me/tokens/{id}` [`revokeMyToken`] → 204.

**Build.**
- A sessions list: each `Session` with its `current` flag, created/last-seen times, user agent, IP
  and expiry; revoke one, and a "sign out everywhere" (`revokeAllSessions`). Mark the current
  session and guard against accidentally revoking it out from under the open app.
- Personal API tokens: list (an `ApiToken` shows only its `tokenPrefix`, never the secret), create
  (name, scope, optional expiry) showing the full secret from `ApiTokenCreated` exactly once with a
  copy affordance, and revoke.
- **Owner note (no code change):** the token schema's `licencePolicy` field is British-spelled, but
  it is a wire key — the client reads and sends it verbatim and does not "correct" it (CLAUDE.md
  never-correct rule for anything crossing the wire).

**Done when.** Sessions and personal tokens are wired to the real operationIds; the created secret
is shown once and not re-retrievable; the current session is protected. Compile-only; tests written
not run.

**Commit.** `R2-008: Account Sessions And Personal Tokens`;
`completion-reports/R2-008-CR-Account-Sessions-And-Personal-Tokens.md` (hash + owner questions).
