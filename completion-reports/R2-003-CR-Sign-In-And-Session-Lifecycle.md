# R2-003 — Completion Report: Sign-In And Session Lifecycle

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule).                                       |
| Implementation commit | `ba6809d0469845e26c2055f463e136655909bf38`                                              |
| Run mode              | Unattended batch (no pause at this gate).                                               |
| Screenshots           | None (compile-only run; no browser/screenshot per standing rule).                       |
| Mock comparison       | The `design/` mocks show dashboards only, no sign-in. See "Compared to the mock".       |

## What was built

An end-user sign-in on the R2-002 session plumbing. Backend calls are exactly the three the prompt
names: `login` (`POST /v1/auth/login`), `logout` (`POST /v1/auth/logout`), and `getMe` (loaded by
the session store on sign-in).

- **`src/auth/auth.ts`** — `signIn(session, LoginRequest)` and `signOut(session)`.
  - `signIn` calls `login`; on a usable session it stores the `SessionToken`
    (`token`/`expiresAt`/`idleExpiresAt`) via `session.sessions.set`, which triggers the R2-002
    refresh that loads `getMe`. The MFA path is driven by the contract: the spec states that when
    MFA is enrolled and no `mfaCode` is sent, `login` answers **200 with `mfaRequired` and no usable
    session (empty `token`, null `expiresAt`)** — `signIn` detects that (`mfaRequired && !token`) and
    returns `'mfa-required'` without storing anything. A wrong code is a `401 INVALID_CREDENTIALS`
    (per the spec), handled as an error on the MFA step.
  - `signOut` posts `logout`, then clears the local session in a `finally`, so sign-out always
    succeeds locally even if the server call 401s (an already-expired session).
- **`src/auth/authError.ts`** — `describeAuthError` maps the login `ProblemDetail` codes to clear
  messages: `INVALID_CREDENTIALS` ("Incorrect email or password.", or a code-specific line on the
  MFA step), `ACCOUNT_DISABLED` (suspended), `RATE_LIMITED` (with the `Retry-After` seconds),
  `VALIDATION_FAILED`, and a fallback to the backend's own `detail`/`title`. **The password is
  never part of a message.**
- **`src/auth/SignIn.tsx` (+ `SignIn.module.css`)** — the `/signin` screen, styled with the app's
  theme tokens and the `Logo`, sitting inside the shell. Email + password; the 6-digit code field is
  revealed (and focused) only when the backend asks; email/password lock while the code is entered;
  errors show in an `role="alert"`. On success it returns the analyst to the route they came from
  (router location `state.from`) or the default route. It offers "Continue without signing in", and
  bounces to the app if already signed in.
- **`src/app/App.tsx`** — the `/signin` route under the shell.
- **`src/app/TopNav.tsx`** — the access control now reflects, in order, a signed-in session (the
  user's email, with a dedicated **Sign out** icon button), a pasted API token ("Token access"), or
  anonymous ("Sign in" → `/signin`). Reuses the existing `.user` button styling.
- **`src/app/Settings.tsx`** — a new **Account** section: when signed in, the identity (email +
  full name) and a **Sign out** button; when anonymous, a line with a **Sign in** link. The existing
  pasted-token and pairing panels are unchanged, so both auth paths coexist.
- **`src/api/testing/fixtures.ts`** — `sessionToken(overrides)` for the `login` result.

The app stays fully usable read-only while signed out (anonymous open reads, R2-002).

## Tests written (not run)

- **`src/auth/auth.test.ts`** (7): `signIn` stores the issued session (happy path); reports
  `mfa-required` with nothing stored when MFA is enrolled and no code was sent; maps
  `INVALID_CREDENTIALS` (and the code-specific message on the MFA step), `ACCOUNT_DISABLED`, and
  `RATE_LIMITED` with the `Retry-After` seconds; `signOut` posts `logout` then clears the session,
  and clears it even when `logout` fails. Built over a real client + session store with an
  in-process `login`/`logout` mock.
- **`src/auth/SignIn.test.tsx`** (2): the MFA field appears after the first submit and the second
  submit (with the code) stores the session and navigates on; bad credentials show the mapped error
  and stay on the form with nothing stored.

## Checks

| Check                                                      | Result                                         |
| ---------------------------------------------------------- | ---------------------------------------------- |
| `npm run typecheck`                                        | Passed                                         |
| `npm run lint`                                             | Passed                                         |
| `npx prettier --check src e2e scripts`                     | Clean                                          |
| `npm run build`                                            | Passed (pre-existing >500 kB chunk warning)    |
| `npm test`, `npm run e2e`, browser run                     | **Not run** (standing rule)                    |
| Guard: `check_us_english.py` over the new/changed files    | 0 British spellings                            |

## Compared to the mock

The `design/` mocks are six dashboards (Global, Analysis, Workbench, conflict/storm views); none
shows a sign-in screen or an account menu. The sign-in screen therefore has no mock to match
pixel-for-pixel; it is built from the same theme tokens, radii and `Logo` the chrome uses, and the
TopNav access control keeps the existing `.user` button shape, so it reads as part of the same
chrome. A browser screenshot is deferred with the rest of the visual proof (standing rule: no
browser run until the set is code-complete).

## Decisions taken (unattended)

1. **MFA is detected from the 200 `mfaRequired` response**, as the spec describes, rather than from
   a special 401. The prompt's "or a 401 asking for a second factor" has no distinct code in the
   contract — a wrong code is `INVALID_CREDENTIALS` — so no separate 401-MFA branch was invented.
2. **A 429 on login is surfaced, not auto-retried.** `retry.ts` retries only `GET`/`HEAD`; a POST
   login carrying credentials must not be silently resubmitted. "Honor `Retry-After`" is met by
   telling the user how long to wait (from `FsError.retryAfter`).
3. **Sign-out lives both in TopNav (icon button) and Settings (Account section).** The prompt said
   "TopNav/Settings"; both carry it so it is reachable wherever the analyst looks.
4. **No route is gated behind sign-in.** The client is "presentation only" with open reads; sign-in
   is additive (per-user view), so every route stays reachable anonymously. The `/signin` screen's
   `from` plumbing is ready for R2-006 if any client view later needs a sign-in gate.

## Owner questions

1. **Sign-in entry points** (decision 3): sign-out is offered in both TopNav and Settings, and
   sign-in via the TopNav access control and a Settings link. Confirm this is the chrome you want,
   or point to a specific mock if one should drive it.
2. **Session expiry display.** `expiresAt`/`idleExpiresAt` are stored (R2-002) but not yet shown or
   acted on (no proactive "your session expired" prompt); a 401 simply drops to anonymous. Flag if
   you want an expiry warning or auto-refresh — otherwise deferred.

Questions carried from R2-001/R2-002 keep their defaults (streams/tiles prefer the session;
device reporting stays API-token-only; ForecastNumericCalibration → R2-010; the extensible enums).
