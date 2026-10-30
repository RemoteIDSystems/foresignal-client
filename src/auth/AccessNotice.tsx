import { Link } from 'react-router';
import { accessRefusal } from '../api/errors';

/**
 * Renders a recoverable notice for an authentication/authorization refusal, or nothing for any
 * other error (or none). A `401` offers a sign-in link; a `403` states the missing permission or
 * the required scope. This is the shared, dead-end-free surface for `401`/`403` across the client.
 */
export function AccessNotice({ error }: { error: unknown }) {
  const refusal = accessRefusal(error);
  if (!refusal) return null;
  return (
    <div role="alert" data-testid="access-notice">
      <p>{refusal.message}</p>
      {refusal.kind === 'sign-in' && <Link to="/signin">Sign in</Link>}
    </div>
  );
}
