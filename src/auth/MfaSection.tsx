import { useState } from 'react';
import { useMe } from '../api/useMe';
import { FsError } from '../api/errors';
import type { Session } from '../app/session';
import {
  disableMfa,
  enrollMfa,
  getMfaRecoveryCodes,
  verifyMfa,
  type MfaEnrollment,
  type MfaStatus,
} from './mfa';

/** Describes an MFA failure, preferring the backend's own problem detail. */
function describe(error: unknown): string {
  if (error instanceof FsError) return error.detail ?? error.title;
  return 'Something went wrong. Please try again.';
}

/**
 * The two-factor section of the account area. It shows the current state (`enabled` from the
 * principal, `required`/`enrolledAt` once a status is known), enrolls (QR + manual fallback) and
 * verifies, disables behind a code/password confirmation, and presents recovery codes once. It
 * renders only for a signed-in user.
 */
export function MfaSection({ session }: { session: Session }) {
  const me = useMe();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return null;

  const enabled = status?.enabled ?? me.user?.mfaEnabled ?? false;
  const required = status?.required ?? session.mfaGate.get();
  const enrolledAt = status?.enrolledAt ?? null;
  const reloadMe = () => void session.principal.load(session.api);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (problem) {
      setError(describe(problem));
    } finally {
      setBusy(false);
    }
  };

  const begin = () => run(async () => setEnrollment(await enrollMfa(session)));
  const verify = () =>
    run(async () => {
      const next = await verifyMfa(session, code);
      setStatus(next);
      setEnrollment(null);
      setCode('');
      if (next.recoveryCodes) setRecoveryCodes(next.recoveryCodes.codes);
      reloadMe();
    });
  const disable = () =>
    run(async () => {
      const next = await disableMfa(session, { code, password });
      setStatus(next);
      setDisabling(false);
      setCode('');
      setPassword('');
      setRecoveryCodes(null);
      reloadMe();
    });
  const regenerate = () =>
    run(async () => setRecoveryCodes((await getMfaRecoveryCodes(session)).codes));

  return (
    <div data-testid="mfa-section">
      <h3>Two-factor authentication</h3>
      <p data-testid="mfa-state">
        {enabled ? 'On' : 'Off'}
        {enabled && enrolledAt ? ` — enrolled ${new Date(enrolledAt).toLocaleDateString()}` : ''}
        {required && !enabled ? ' — required by your role' : ''}
      </p>

      {!enabled && !enrollment && (
        <button type="button" onClick={begin} disabled={busy}>
          Set up two-factor authentication
        </button>
      )}

      {!enabled && enrollment && (
        <div data-testid="mfa-enroll">
          <p>Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
          {enrollment.qrSvg && (
            <img
              width={180}
              height={180}
              alt="QR code for your authenticator app"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrSvg)}`}
            />
          )}
          <p>
            Can&rsquo;t scan? Enter this key manually: <code>{enrollment.secret}</code>
            <br />
            <a href={enrollment.otpauthUri}>Open in your authenticator app</a>
          </p>
          <label>
            Code{' '}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>{' '}
          <button type="button" onClick={verify} disabled={busy || code.trim().length < 6}>
            Verify and enable
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setEnrollment(null);
              setCode('');
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {enabled && !disabling && (
        <p>
          <button type="button" onClick={() => setDisabling(true)} disabled={busy}>
            Disable
          </button>{' '}
          <button type="button" onClick={regenerate} disabled={busy}>
            Regenerate recovery codes
          </button>
        </p>
      )}

      {enabled && disabling && (
        <div data-testid="mfa-disable">
          <p>Confirm with a current code or your password to turn off two-factor authentication.</p>
          <label>
            Code{' '}
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>{' '}
          <label>
            Password{' '}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>{' '}
          <button type="button" onClick={disable} disabled={busy || (!code.trim() && !password)}>
            Confirm disable
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setDisabling(false);
              setCode('');
              setPassword('');
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {recoveryCodes && (
        <div data-testid="mfa-recovery-codes">
          <p role="status">
            Save these recovery codes now — each works once, and they will not be shown again.
          </p>
          <ul>
            {recoveryCodes.map((recoveryCode) => (
              <li key={recoveryCode}>
                <code>{recoveryCode}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" data-testid="mfa-error">
          {error}
        </p>
      )}
    </div>
  );
}
