# R2-003 — Sign-In And Session Lifecycle

**Goal.** An end-user sign-in: email and password (with the MFA code when the account requires it),
sign-out, and the lifecycle around them — so an analyst signs in to get their per-user view, and the
app falls back to anonymous reads when signed out.

**Read first.** R2-002-CR; the `design/` mockups for the app chrome.
Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `POST /v1/auth/login` [`login`] — body `LoginRequest` (`email`, `password`, optional `mfaCode`) →
  `SessionToken` (`token`, `tokenPrefix`, `userId`, `expiresAt`, `idleExpiresAt`, `mfaRequired`,
  `scopes[]`, `permissions[]`).
- `POST /v1/auth/logout` [`logout`] → 204.
- `GET /v1/me` [`getMe`] — load the full principal after login.

**Build.**
- A sign-in screen/route: email + password. When `login` returns `mfaRequired` (or a `401` asking
  for a second factor), reveal a 6-digit `mfaCode` field and resubmit the same credentials with it.
  On success, store the `SessionToken` via the R2-002 session store and load `getMe`.
- Sign-out: call `logout`, clear the session, return to anonymous.
- A sign-in affordance in `TopNav`/`Settings`: show the signed-in identity (email) with a sign-out
  action, or a "Sign in" action when anonymous. The app stays usable read-only while signed out.
- Map `ProblemDetail` auth failures to clear messages — bad credentials, suspended account,
  rate-limited (honor `Retry-After` through the existing `src/api/retry.ts` layer) — never echoing
  the password.

**Done when.** The login → session → `getMe` happy path, the MFA-required step, and sign-out are
wired to the real operationIds; the screens match the mockups' chrome; anonymous fallback is intact.
Unit-tested with a mock `login`/`logout`/`getMe`; compile-only, tests written not run.

**Commit.** `R2-003: Sign-In And Session Lifecycle`;
`completion-reports/R2-003-CR-Sign-In-And-Session-Lifecycle.md` (hash + owner questions).
