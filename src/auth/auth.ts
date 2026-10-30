import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';
import type { Session } from '../app/session';
import { describeAuthError } from './authError';

/** The sign-in request body (`login`): email, password, and the MFA code when enrolled. */
export type LoginRequest = components['schemas']['LoginRequest'];

/** The issued session (`login` → `SessionToken`). */
export type SessionToken = components['schemas']['SessionToken'];

/**
 * The outcome of a sign-in attempt:
 * - `ok` — a usable session was issued and stored; `getMe` loads via the session store.
 * - `mfa-required` — the password was accepted but MFA is enrolled; resubmit with an `mfaCode`.
 * - `error` — a mapped, user-facing failure message (never echoing the password).
 */
export type SignInResult =
  { status: 'ok' } | { status: 'mfa-required' } | { status: 'error'; message: string };

/**
 * Signs in with `login` (`POST /v1/auth/login`). On a usable session, the `SessionToken` is stored
 * through the R2-002 session store, which rehydrates the principal from `getMe`. When MFA is
 * enrolled and no `mfaCode` was given, the backend answers 200 with `mfaRequired` and no usable
 * session (empty `token`), reported here as `mfa-required` so the caller can collect the code and
 * resubmit the same credentials with it.
 */
export async function signIn(session: Session, body: LoginRequest): Promise<SignInResult> {
  try {
    const issued = await unwrap(session.api.POST('/v1/auth/login', { body }));
    if (issued.mfaRequired && !issued.token) {
      return { status: 'mfa-required' };
    }
    session.sessions.set({
      token: issued.token,
      expiresAt: issued.expiresAt,
      idleExpiresAt: issued.idleExpiresAt,
    });
    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'error',
      message: describeAuthError(error, { mfaStep: Boolean(body.mfaCode) }),
    };
  }
}

/**
 * Signs out with `logout` (`POST /v1/auth/logout`), then clears the local session so the app falls
 * back to anonymous open reads. The local session is cleared even if the server call fails (for
 * example an already-expired session), so sign-out always succeeds locally.
 */
export async function signOut(session: Session): Promise<void> {
  try {
    await unwrap(session.api.POST('/v1/auth/logout', {}));
  } catch {
    // The session may already be gone server-side; drop it locally regardless.
  } finally {
    session.sessions.clear();
  }
}
