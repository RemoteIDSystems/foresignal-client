# R2-005 — Multi-Factor Authentication

**Goal.** TOTP multi-factor self-management and the enrollment gate: enroll with a QR code, verify,
disable, and view or regenerate recovery codes, and honor the backend's "MFA enrollment required"
state for roles that mandate a second factor.

**Read first.** R2-003-CR (the login step-up already collects `mfaCode` there).
Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `POST /v1/me/mfa/enroll` [`enrollMfa`] → `MfaEnrollment` (`secret`, `otpauthUri`, `qrSvg`).
- `POST /v1/me/mfa/verify` [`verifyMfa`] — body `MfaVerifyRequest` → `MfaStatus`.
- `POST /v1/me/mfa/disable` [`disableMfa`] — body `MfaDisableRequest` → `MfaStatus`.
- `GET /v1/me/mfa/recovery-codes` [`getMfaRecoveryCodes`] → `MfaRecoveryCodes`.

**Build.**
- An MFA section in the account area: show `MfaStatus` (`enabled`, `required`, `enrolledAt`).
  Enroll renders the returned `qrSvg` (falling back to `otpauthUri` and the plain `secret` for a
  manual entry); verify with a code to complete; disable behind the required confirmation; show and
  regenerate recovery codes, presenting them once for the user to save.
- The enrollment gate: when a signed-in user's role requires MFA they have not enrolled, the backend
  answers writes with `403 MFA_ENROLLMENT_REQUIRED`. Catch that in the API error layer and route the
  user to enrollment before letting them continue, rather than surfacing a raw error.

**Done when.** Enroll, verify, disable and recovery-codes are wired to the real operationIds; the
QR renders; the enrollment-required refusal routes to enrollment. Unit-tested with mocks;
compile-only, tests written not run.

**Commit.** `R2-005: Multi-Factor Authentication`;
`completion-reports/R2-005-CR-Multi-Factor-Authentication.md` (hash + owner questions).
