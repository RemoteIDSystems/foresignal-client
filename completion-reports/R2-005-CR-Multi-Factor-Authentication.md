# R2-005 — Completion Report: Multi-Factor Authentication

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule).                                       |
| Implementation commit | `9b3e6aff1900aea8b33b0345288e9cd4b0e2f2f7`                                              |
| Run mode              | Unattended batch (no pause at this gate).                                               |
| Screenshots           | None (compile-only run).                                                                |
| Mock comparison       | No mock covers the account/security area; see "Compared to the mock".                   |

## What was built

TOTP self-management and the enrollment gate, each on the operationId the prompt names.

- **`src/auth/mfa.ts`:** `enrollMfa` (`POST /v1/me/mfa/enroll`), `verifyMfa`
  (`POST /v1/me/mfa/verify`), `disableMfa` (`POST /v1/me/mfa/disable`), `getMfaRecoveryCodes`
  (`GET /v1/me/mfa/recovery-codes`), and `createMfaGate` — a subscribable flag for the
  enrollment-required state.
- **`src/auth/MfaSection.tsx`** (in the Settings Account area, signed-in only):
  - **Status**: "On/Off" from `me.user.mfaEnabled`; `enrolledAt` and `required` shown once a
    `MfaStatus` is known (from a verify/disable response or the gate). There is no status `GET` in
    the contract (verified), so at rest only `enabled` is known — see decision 1.
  - **Enroll**: renders the returned `qrSvg` as an `<img>` from a `data:image/svg+xml` URI (so the
    backend SVG is drawn, not injected as live HTML), with the `otpauthUri` link and the plain
    `secret` as a manual fallback. A 6-digit code verifies and activates.
  - **Recovery codes**: the first set (from `MfaStatus.recoveryCodes` on the activating `verifyMfa`)
    and any regenerated set (`getMfaRecoveryCodes`) are presented once, with a save-now warning.
  - **Disable**: behind a confirmation taking a current code and/or the password
    (`MfaDisableRequest`).
  - After verify/disable it reloads `getMe` so `Me.user.mfaEnabled` (and the gate) update.
- **`src/api/client.ts`** — `onForbidden(code, request)`: on any `403`, the problem `code` is read
  from a **response clone** (the original response is untouched) and reported.
- **`src/app/session.ts`** — `onForbidden` raises `mfaGate` on `MFA_ENROLLMENT_REQUIRED`; the gate
  lowers when the principal reloads with MFA enabled. `Session` exposes `mfaGate`.
- **`src/auth/MfaGateModal.tsx`** (rendered in `AppShell`) — when the gate is raised for a signed-in
  user who has not enrolled, a blocking `Modal` routes them to security settings instead of
  surfacing the raw refusal; reading stays available, and it clears on enrollment.

## The recovery-codes semantics (verified)

`GET /v1/me/mfa/recovery-codes` returns `MfaRecoveryCodes` with ten `codes`, which are "stored
hashed". A GET cannot return hashed values in the clear, so each call issues a fresh set that
supersedes the last — the client treats the action as "regenerate", presenting the new codes once.
`MfaStatus.recoveryCodes` is a nested `MfaRecoveryCodes` object (not a bare array), present only on
the activating `verifyMfa` answer; the code reads `.codes` from it.

## Tests written (not run)

- **`src/auth/mfa.test.ts`** (7): enroll returns secret/QR; verify returns the status and the first
  recovery codes; disable posts the code and reports disabled; recovery-codes returns a fresh set;
  `createMfaGate` raises/lowers and notifies on change only; the client `onForbidden` hook reports
  the `403` problem code from a clone while the response stays readable.
- **`src/auth/MfaSection.test.tsx`** (3): renders nothing when anonymous; the enroll → QR + secret →
  verify → recovery-codes flow, ending "On"; the enrolled state shows "On" and a Disable control.

## Checks

| Check                                                   | Result                                      |
| ------------------------------------------------------- | ------------------------------------------- |
| `npm run typecheck`                                     | Passed                                      |
| `npm run lint`                                          | Passed                                      |
| `npx prettier --check src e2e scripts`                  | Clean                                       |
| `npm run build`                                         | Passed (pre-existing chunk warning)         |
| `npm test`, `npm run e2e`, browser run                  | **Not run** (standing rule)                 |
| Guard: `check_us_english.py` over the new/changed files | 0 British spellings                         |

## Compared to the mock

No `design/` mock covers the account/security area. The section is plain controls inside the
existing Settings card (so it inherits that chrome), and the gate uses the shared `Modal`. Visual
proof is deferred (standing rule).

## Decisions taken (unattended)

1. **At rest only `enabled` is known.** With no status `GET`, `enabled` comes from
   `Me.user.mfaEnabled`; `required`/`enrolledAt` fill in from a verify/disable `MfaStatus` or (for
   `required`) the enrollment gate. The section does not fabricate `required` from roles, since the
   client cannot know which roles mandate MFA.
2. **The QR is drawn as an `<img>` data URI**, not via `dangerouslySetInnerHTML` (none exists in the
   codebase). The `otpauthUri`/`secret` fallback is always shown for manual entry.
3. **The gate is a blocking modal, reading stays live.** "Route to enrollment before letting them
   continue" is met by a modal that a signed-in, un-enrolled user cannot incidentally dismiss into a
   raw error (closing it goes to settings); it clears automatically on enrollment.
4. **The 403 body is read from a clone.** So `onForbidden` never consumes the response the caller's
   `unwrap` still needs.

## Owner questions

1. **MFA status at rest.** Should the backend expose a `getMfaStatus` (or add `enrolledAt`/`required`
   to `Me`) so the section shows the full status before any verify/disable? Today `required` is only
   certain after the gate fires.
2. **Gate scope.** The gate is raised by any `403 MFA_ENROLLMENT_REQUIRED` from any write. It is a
   global modal; confirm that is the wanted behavior rather than gating per-action.
3. **Disable requirements.** `MfaDisableRequest` makes both `code` and `password` optional; the UI
   accepts either. Confirm which the backend actually requires, so the form can require it too.

Questions carried from R2-001–R2-004 keep their defaults.
