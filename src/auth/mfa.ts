import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';
import type { Session } from '../app/session';

/** Current MFA state (`MfaStatus`): whether it is `enabled`, `required` by a role, and `enrolledAt`. */
export type MfaStatus = components['schemas']['MfaStatus'];

/** A fresh enrollment (`enrollMfa`): the TOTP `secret`, `otpauthUri`, and an inline `qrSvg`. */
export type MfaEnrollment = components['schemas']['MfaEnrollment'];

/** A generated set of single-use recovery codes (`MfaRecoveryCodes`). */
export type MfaRecoveryCodes = components['schemas']['MfaRecoveryCodes'];

/** Begins TOTP enrollment (`enrollMfa`, `POST /v1/me/mfa/enroll`): returns the secret and QR. */
export function enrollMfa(session: Session): Promise<MfaEnrollment> {
  return unwrap(session.api.POST('/v1/me/mfa/enroll', {}));
}

/**
 * Verifies a TOTP code to activate MFA (`verifyMfa`, `POST /v1/me/mfa/verify`). The activating
 * answer carries the first set of recovery codes in `MfaStatus.recoveryCodes`.
 */
export function verifyMfa(session: Session, code: string): Promise<MfaStatus> {
  return unwrap(session.api.POST('/v1/me/mfa/verify', { body: { code: code.trim() } }));
}

/**
 * Disables MFA (`disableMfa`, `POST /v1/me/mfa/disable`) with a current TOTP or recovery code,
 * and/or the account password, as the account requires.
 */
export function disableMfa(
  session: Session,
  input: { code?: string; password?: string },
): Promise<MfaStatus> {
  const body: components['schemas']['MfaDisableRequest'] = {};
  if (input.code?.trim()) body.code = input.code.trim();
  if (input.password) body.password = input.password;
  return unwrap(session.api.POST('/v1/me/mfa/disable', { body }));
}

/**
 * Returns a fresh set of recovery codes (`getMfaRecoveryCodes`, `GET /v1/me/mfa/recovery-codes`).
 * Codes are stored hashed, so each call issues a new set that replaces the last; present them once.
 */
export function getMfaRecoveryCodes(session: Session): Promise<MfaRecoveryCodes> {
  return unwrap(session.api.GET('/v1/me/mfa/recovery-codes'));
}

/**
 * A subscribable flag that is raised when the backend refuses a write with
 * `403 MFA_ENROLLMENT_REQUIRED` (a role mandates a second factor the user has not enrolled), and
 * lowered once the user has enrolled. The app shell shows the enrollment prompt while it is raised.
 */
export interface MfaGate {
  /** True while enrollment is required and not yet done. */
  get(): boolean;
  /** Raises or lowers the flag. */
  set(required: boolean): void;
  /** Calls `listener` on every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** Creates a lowered {@link MfaGate}. */
export function createMfaGate(): MfaGate {
  let required = false;
  const listeners = new Set<() => void>();
  return {
    get: () => required,
    set(next) {
      if (next === required) return;
      required = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
