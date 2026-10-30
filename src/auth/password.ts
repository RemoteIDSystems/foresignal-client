import { unwrap } from '../api/client';
import type { Session } from '../app/session';
import { describePasswordError, type PasswordErrorResult } from './authError';

/** The shortest password the client lets you submit; the backend's policy is authoritative. */
export const MIN_PASSWORD_LENGTH = 12;

/** The outcome of a set-password flow (`activate`/`reset`). */
export type PasswordResult = { status: 'ok' } | ({ status: 'error' } & PasswordErrorResult);

/**
 * Activates an invited account (`activateAccount`, `POST /v1/auth/activate`) with the token from the
 * `/activate` deep link and a first password. On success the caller routes to sign-in.
 */
export async function activateAccount(
  session: Session,
  input: { token: string; password: string },
): Promise<PasswordResult> {
  try {
    await unwrap(session.api.POST('/v1/auth/activate', { body: input }));
    return { status: 'ok' };
  } catch (error) {
    return { status: 'error', ...describePasswordError(error, 'activate') };
  }
}

/**
 * Completes a password reset (`resetPassword`, `POST /v1/auth/password/reset`) with the token from
 * the `/reset` deep link and the new password.
 */
export async function resetPassword(
  session: Session,
  input: { token: string; newPassword: string },
): Promise<PasswordResult> {
  try {
    await unwrap(session.api.POST('/v1/auth/password/reset', { body: input }));
    return { status: 'ok' };
  } catch (error) {
    return { status: 'error', ...describePasswordError(error, 'reset') };
  }
}

/**
 * Requests a password-reset email (`requestPasswordReset`, `POST /v1/auth/password/reset-request`).
 *
 * It resolves without reporting the outcome: the UI always shows the same neutral confirmation
 * whatever the backend answered (202, 400 or 429), so the presence or absence of an account is
 * never disclosed. A thrown network error is swallowed for the same reason.
 */
export async function requestPasswordReset(session: Session, email: string): Promise<void> {
  try {
    await session.api.POST('/v1/auth/password/reset-request', { body: { email: email.trim() } });
  } catch {
    // Neutral by design: never reveal whether the request reached the backend or matched an account.
  }
}
