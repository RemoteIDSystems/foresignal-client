import { Link, useSearchParams } from 'react-router';
import { Logo } from '../app/Logo';
import type { Session } from '../app/session';
import { activateAccount } from './password';
import { SetPasswordForm } from './SetPasswordForm';
import styles from './SignIn.module.css';

/**
 * The invite-activation screen (`/activate?token=…`): the invited user sets a first password, which
 * is posted with the link's token via `activateAccount`. A missing token renders a clear, recoverable
 * message rather than an empty form.
 */
export function Activate({ session }: { session: Session }) {
  const [params] = useSearchParams();
  const token = params.get('token');

  if (!token) {
    return (
      <div className={styles.view}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <Logo />
            <h1 className={styles.heading}>Activation link needed</h1>
          </div>
          <p className={styles.sub} role="alert">
            This page needs the activation link from your invitation email. Open the link again, or
            ask your administrator for a new invitation.
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
      heading="Activate your account"
      intro="Set a password to finish setting up your ForeSignal account."
      submitLabel="Activate account"
      successMessage="Your account is active. You can sign in now."
      onSubmit={(password) => activateAccount(session, { token, password })}
    />
  );
}
