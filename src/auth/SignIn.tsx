import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMe } from '../api/useMe';
import { DEFAULT_ROUTE } from '../app/routes';
import type { Session } from '../app/session';
import { Logo } from '../app/Logo';
import { signIn } from './auth';
import styles from './SignIn.module.css';

/** Location state a protected route may set so sign-in returns the analyst where they were going. */
interface SignInLocationState {
  from?: string;
}

/**
 * The sign-in screen: email and password, with a 6-digit MFA code revealed when the account
 * requires it. On success the session is stored (which loads `getMe`) and the analyst is sent on to
 * where they were headed, or the default route. The app stays usable read-only without signing in.
 */
export function SignIn({ session }: { session: Session }) {
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mfaRef = useRef<HTMLInputElement>(null);

  const from = (location.state as SignInLocationState | null)?.from ?? DEFAULT_ROUTE;

  // Already signed in (e.g. navigated here by hand): there is nothing to do, go on.
  useEffect(() => {
    if (me) navigate(from, { replace: true });
  }, [me, from, navigate]);

  // When the MFA step appears, move focus to the code field.
  useEffect(() => {
    if (mfaStep) mfaRef.current?.focus();
  }, [mfaStep]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn(session, {
      email: email.trim(),
      password,
      ...(mfaStep && mfaCode.trim() ? { mfaCode: mfaCode.trim() } : {}),
    });
    setBusy(false);
    if (result.status === 'ok') {
      navigate(from, { replace: true });
    } else if (result.status === 'mfa-required') {
      setMfaStep(true);
      setError(null);
    } else {
      setError(result.message);
    }
  };

  return (
    <div className={styles.view}>
      <form className={styles.card} onSubmit={submit} aria-labelledby="signin-heading">
        <div className={styles.brand}>
          <Logo />
          <h1 id="signin-heading" className={styles.heading}>
            Sign in to ForeSignal
          </h1>
        </div>
        <p className={styles.sub}>
          Sign in for your per-user view. You can keep reading without one.
        </p>

        <label className={styles.field}>
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            disabled={mfaStep}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={mfaStep}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {mfaStep && (
          <label className={styles.field}>
            <span>Authentication code</span>
            <input
              ref={mfaRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))}
            />
            <span className={styles.hint}>Enter the 6-digit code from your authenticator app.</span>
          </label>
        )}

        {error && (
          <p className={styles.error} role="alert" data-testid="signin-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          className={styles.submit}
          disabled={busy || !email.trim() || !password || (mfaStep && mfaCode.trim().length < 6)}
        >
          {busy ? 'Signing in…' : mfaStep ? 'Verify and sign in' : 'Sign in'}
        </button>

        <button
          type="button"
          className={styles.anon}
          onClick={() => navigate(DEFAULT_ROUTE, { replace: true })}
        >
          Continue without signing in
        </button>
      </form>
    </div>
  );
}
