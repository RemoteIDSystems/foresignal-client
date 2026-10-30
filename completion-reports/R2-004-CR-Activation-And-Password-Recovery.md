# R2-004 — Completion Report: Activation And Password Recovery

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule).                                       |
| Implementation commit | `d49b3379887d717bbd7bf313eeb0be5d4a079a12`                                              |
| Run mode              | Unattended batch (no pause at this gate).                                               |
| Screenshots           | None (compile-only run).                                                                |
| Mock comparison       | No mock covers these unauthenticated screens; see "Compared to the mock".               |

## What was built

The three unauthenticated credential flows, each on the operationId the prompt names.

- **`src/auth/password.ts`:**
  - `activateAccount(session, { token, password })` → `activateAccount` (`POST /v1/auth/activate`),
    204.
  - `resetPassword(session, { token, newPassword })` → `resetPassword`
    (`POST /v1/auth/password/reset`), 204.
  - `requestPasswordReset(session, email)` → `requestPasswordReset`
    (`POST /v1/auth/password/reset-request`), 202. It **resolves without reporting the outcome** —
    2xx, 4xx, 429 or even a thrown network error are all swallowed — so the UI shows one neutral
    confirmation and never discloses whether an account exists.
  - `MIN_PASSWORD_LENGTH = 12` — a client-side hint only (see owner question 1).
- **`src/auth/authError.ts` — `describePasswordError(error, flow)`:** maps
  `410 ACTIVATION_TOKEN_GONE` (not self-recoverable: ask an administrator) and
  `410 RESET_TOKEN_GONE` (recoverable: request a new link) to clear messages, and prefers the
  backend's own `detail` for `VALIDATION_FAILED` (the weak-password rule is the backend's). Each
  result carries a `recoverable` flag; no path is a dead end.
- **`src/auth/SetPasswordForm.tsx`:** the shared password + confirmation form. It enforces the
  client minimum and a matching confirmation before enabling submit, shows the length requirement,
  and on success renders a confirmation panel with a **Go to sign in** link.
- **`src/auth/Activate.tsx` (`/activate?token=…`)** and **`src/auth/ResetPassword.tsx`
  (`/reset?token=…`):** the deep-link landing screens. A missing token renders a recoverable
  message (open the link again / ask for a new one), not an empty form; the reset screen also
  carries a "Request a new reset link" affordance for the expired-token case.
- **`src/auth/SignIn.tsx`:** a **Forgot password?** action (hidden during the MFA step) that posts
  the reset request for the entered email and shows the neutral confirmation. With no email entered
  it prompts for one first.
- **`src/app/App.tsx`:** `/activate` and `/reset` routes under the shell, beside `/signin`.

## Tests written (not run)

- **`src/auth/password.test.ts`** (7): activate ok (204), the 410 non-recoverable token message,
  and the backend-detail weak-password message; reset ok (204) and the 410 recoverable message;
  the reset request posts the trimmed email and resolves neutrally on 202 and on 429.
- **`src/auth/Activate.test.tsx`** (3): the missing-token prompt; the success path (posts
  `{token, password}`, shows the sign-in link); an expired token renders a recoverable error.
- **`src/auth/SignIn.test.tsx`** (+1): "Forgot password" posts the request and shows the same
  neutral confirmation.

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

The `design/` mocks are dashboards; none shows activation or reset. These screens reuse the
`SignIn.module.css` card, theme tokens and `Logo` introduced in R2-003, so they read as one chrome
with sign-in. Visual proof is deferred with the rest (standing rule).

## Decisions taken (unattended)

1. **The reset request is neutral for every response**, including 429 — the confirmation is the
   same whether the backend accepted, rejected or rate-limited it. This is stricter than only
   hiding account existence, but it is the simplest guarantee of non-disclosure and matches "always
   the same neutral confirmation, whatever the response."
2. **`MIN_PASSWORD_LENGTH = 12` is a client hint, not a contract rule.** The spec states no password
   policy (no `minLength` on `AccountActivation.password`/`PasswordReset.newPassword`, no
   `PasswordPolicy` schema — verified by search). The backend's `VALIDATION_FAILED` stays
   authoritative and its `detail` is shown verbatim. See owner question 1.
3. **Deep-link screens live inside the app shell**, like `/signin`, for one consistent chrome. A
   freshly-invited user sees the nav frame plus the card.
4. **Activation success routes to sign-in** (prompt), shown as a confirmation panel with a sign-in
   link rather than an automatic redirect, so the outcome is legible.

## Owner questions

1. **Password policy.** The spec documents none, so the client shows a 12-character minimum as a
   hint and defers to the backend's `VALIDATION_FAILED`. What is the real policy (length, classes,
   breach check), and should the client display it precisely — or expose it via `getSystem`/a new
   endpoint so the client need not hard-code it?
2. **Neutral reset on 429** (decision 1): a hammered reset button shows success text with no "slow
   down" hint. Acceptable, or should a rate-limit be surfaced without disclosing account existence?

Questions carried from R2-001–R2-003 keep their defaults.
