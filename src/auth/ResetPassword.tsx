import { Link, useSearchParams } from 'react-router';
import { Logo } from '../app/Logo';
import type { Session } from '../app/session';
import { resetPassword } from './password';
import { SetPasswordForm } from './SetPasswordForm';
import styles from './SignIn.module.css';

/**
 * The password-reset screen (`/reset?token=…`): the user sets a new password, posted with the
 * link's token via `resetPassword`. A missing or expired token keeps a recoverable path to request
 * a fresh reset from the sign-in screen, never a dead end.
 */
export function ResetPassword({ session }: { session: Session }) {
  const [params] = useSearchParams();
  const token = params.get('token');

  if (!token) {
    return (
      <div className={styles.view}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <Logo />
            <h1 className={styles.heading}>Reset link needed</h1>
          </div>
          <p className={styles.sub} role="alert">
            This page needs the reset link from your email. Open the link again, or request a new
            one from the sign-in screen.
          </p>
          <Link className={styles.anon} to="/signin">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SetPasswordForm
      heading="Set a new password"
      intro="Choose a new password for your ForeSignal account."
      submitLabel="Set new password"
      successMessage="Your password has been reset. You can sign in now."
      onSubmit={(newPassword) => resetPassword(session, { token, newPassword })}
      footer={
        <Link className={styles.anon} to="/signin">
          Request a new reset link
        </Link>
      }
    />
  );
}
