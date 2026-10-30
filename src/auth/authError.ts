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

/** A mapped password-flow failure and whether the user can recover it from the same screen. */
export interface PasswordErrorResult {
  /** The user-facing message. */
  message: string;
  /** True when the user can retry/ask for a new link here, rather than hitting a dead end. */
  recoverable: boolean;
}

/**
 * Maps a failed `activateAccount`/`resetPassword` call to a clear message. An expired, used or
 * unknown token (`410 ACTIVATION_TOKEN_GONE`/`RESET_TOKEN_GONE`) is recoverable — the screen points
 * the user to a fresh link — never a dead end. A `VALIDATION_FAILED` (weak password) prefers the
 * backend's own `detail`, since the exact policy is the backend's.
 */
export function describePasswordError(
  error: unknown,
  flow: 'activate' | 'reset',
): PasswordErrorResult {
  if (error instanceof FsError) {
    switch (error.code) {
      case 'ACTIVATION_TOKEN_GONE':
        return {
          message:
            'This activation link has expired or has already been used. Ask your administrator for a new invitation.',
          recoverable: false,
        };
      case 'RESET_TOKEN_GONE':
        return {
          message:
            'This reset link has expired or has already been used. Request a new one from the sign-in screen.',
          recoverable: true,
        };
      case 'VALIDATION_FAILED':
        return {
          message:
            error.detail ?? 'That password does not meet the requirements. Try a stronger one.',
          recoverable: true,
        };
      default:
        return {
          message:
            error.detail ??
            error.title ??
            (flow === 'activate'
              ? 'Could not activate the account.'
              : 'Could not reset the password.'),
          recoverable: true,
        };
    }
  }
  return {
    message:
      flow === 'activate' ? 'Could not activate the account.' : 'Could not reset the password.',
    recoverable: true,
  };
}
