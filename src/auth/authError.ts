import { FsError } from '../api/errors';

/** Context for {@link describeAuthError}. */
export interface AuthErrorContext {
  /** True when the failing attempt carried an MFA code, so the message can name the code. */
  mfaStep?: boolean;
}

/**
 * Maps a failed `login`/`logout` call to a clear, user-facing message, from the backend's
 * `ProblemDetail` code. The password is never part of any message. Unknown problems fall back to
 * the backend's own `detail`/`title`, then a generic line.
 */
export function describeAuthError(error: unknown, context: AuthErrorContext = {}): string {
  if (error instanceof FsError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return context.mfaStep
          ? 'That code or password was not accepted. Check the 6-digit code and try again.'
          : 'Incorrect email or password.';
      case 'ACCOUNT_DISABLED':
        return 'This account is suspended or disabled. Contact your administrator.';
      case 'RATE_LIMITED': {
        const seconds = error.retryAfter;
        return seconds
          ? `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
          : 'Too many attempts. Please wait a moment and try again.';
      }
      case 'VALIDATION_FAILED':
        return 'Enter a valid email address and password.';
      default:
        return error.detail ?? error.title ?? 'Sign-in failed. Please try again.';
    }
  }
  return 'Sign-in failed. Please try again.';
}
