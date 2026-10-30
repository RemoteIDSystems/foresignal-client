import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../app/Logo';
import { MIN_PASSWORD_LENGTH, type PasswordResult } from './password';
import styles from './SignIn.module.css';

/** Props for {@link SetPasswordForm}. */
export interface SetPasswordFormProps {
  /** Heading above the form (e.g. "Set your password"). */
  heading: string;
  /** A line of context under the heading. */
  intro: string;
  /** The submit button's label. */
  submitLabel: string;
  /** Posts the chosen password; returns `ok` or a mapped error. */
  onSubmit: (password: string) => Promise<PasswordResult>;
  /** Shown on success, above the "Go to sign in" link. */
  successMessage: string;
  /** Optional recovery affordance shown under the form (e.g. a "request a new link" link). */
  footer?: ReactNode;
}

/**
 * A password-with-confirmation form used by both the activation and the reset screens. It enforces
 * the client-side {@link MIN_PASSWORD_LENGTH} and a matching confirmation before enabling submit;
 * the backend's policy stays authoritative (a `VALIDATION_FAILED` surfaces its own message). On
 * success it shows a confirmation with a link to sign in, never a dead end.
 */
export function SetPasswordForm({
  heading,
  intro,
  submitLabel,
  onSubmit,
  successMessage,
  footer,
}: SetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && confirm === password && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await onSubmit(password);
    setBusy(false);
    if (result.status === 'ok') setDone(true);
    else setError(result.message);
  };

  if (done) {
    return (
      <div className={styles.view}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <Logo />
            <h1 className={styles.heading}>Done</h1>
          </div>
          <p className={styles.sub} role="status" data-testid="setpassword-done">
            {successMessage}
          </p>
          <Link className={styles.submit} to="/signin" style={{ textAlign: 'center' }}>
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <form className={styles.card} onSubmit={submit} aria-labelledby="setpassword-heading">
        <div className={styles.brand}>
          <Logo />
          <h1 id="setpassword-heading" className={styles.heading}>
            {heading}
          </h1>
        </div>
        <p className={styles.sub}>{intro}</p>

        <label className={styles.field}>
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="password-hint"
          />
          <span className={styles.hint} id="password-hint">
            At least {MIN_PASSWORD_LENGTH} characters.
          </span>
        </label>

        <label className={styles.field}>
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>

        {tooShort && (
          <p className={styles.error} role="alert">
            Use at least {MIN_PASSWORD_LENGTH} characters.
          </p>
        )}
        {mismatch && (
          <p className={styles.error} role="alert">
            The two passwords do not match.
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert" data-testid="setpassword-error">
            {error}
          </p>
        )}

        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {busy ? 'Working…' : submitLabel}
        </button>

        {footer}
      </form>
    </div>
  );
}
