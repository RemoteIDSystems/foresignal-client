# R2-004 — Activation And Password Recovery

**Goal.** The unauthenticated credential flows an invited or locked-out user needs: activate an
invited account by setting a first password, and request and complete a password reset — all from
deep-linked tokens delivered by email.

**Read first.** R2-003-CR. Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `POST /v1/auth/activate` [`activateAccount`] — body `AccountActivation` (`token`, `password`) → 204.
- `POST /v1/auth/password/reset-request` [`requestPasswordReset`] — body `PasswordResetRequest` → 202.
- `POST /v1/auth/password/reset` [`resetPassword`] — body `PasswordReset` → 204.

**Build.**
- Route `/activate?token=…`: a set-password screen that posts `activateAccount` with the token from
  the link; on success, route to sign-in.
- Route `/reset?token=…`: a set-new-password screen that posts `resetPassword`.
- A "Forgot password" action on the sign-in screen (R2-003) that posts `requestPasswordReset` and
  always shows the same neutral confirmation, whatever the response — no account-existence
  disclosure.
- Password entry with confirmation and a visible strength requirement; map `4xx` `ProblemDetail`
  responses (expired or already-used token, weak password) to clear messages.

**Done when.** The three flows are wired to the real operationIds and their deep-link routes; an
expired-token response renders a recoverable error, not a dead end. Unit-tested with mocks;
compile-only, tests written not run.

**Commit.** `R2-004: Activation And Password Recovery`;
`completion-reports/R2-004-CR-Activation-And-Password-Recovery.md` (hash + owner questions).
