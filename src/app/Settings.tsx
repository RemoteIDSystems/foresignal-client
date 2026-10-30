import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link } from 'react-router';
import { unwrap } from '../api/client';
import { FsError } from '../api/errors';
import { useMe } from '../api/useMe';
import { signOut } from '../auth/auth';
import { MfaSection } from '../auth/MfaSection';
import { describeDevice } from '../lib/deviceId';
import { baseUrl } from '../lib/config';
import { useCapabilities } from '../state/capabilities';
import type { Session } from './session';

/** Describes an error for display, preferring the backend's problem code and detail. */
function describeError(error: unknown): string {
  if (error instanceof FsError) {
    return [error.status, error.code, error.detail ?? error.title].filter(Boolean).join(' · ');
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Minimal settings: the backend connection, a bearer token to paste or clear, and pairing-code
 * claim (`claimPairingCode`, `POST /v1/pairing/claim`).
 */
export function Settings({ session }: { session: Session }) {
  const token = useSyncExternalStore(session.tokens.subscribe, session.tokens.get);
  const me = useMe();
  const capabilities = useCapabilities(session.capabilities);
  const [draft, setDraft] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const saveToken = (event: FormEvent) => {
    event.preventDefault();
    session.tokens.set(draft);
    setDraft('');
    setMessage('Token saved.');
  };

  const claim = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('Claiming…');
    try {
      const created = await unwrap(
        session.api.POST('/v1/pairing/claim', {
          body: { code: code.trim(), device: describeDevice(__APP_VERSION__) },
        }),
      );
      session.tokens.set(created.token);
      setCode('');
      setMessage(`Paired. Token ${created.tokenPrefix}… saved (scope ${created.scope}).`);
    } catch (error) {
      setMessage(`Pairing failed: ${describeError(error)}`);
    }
  };

  return (
    <section aria-labelledby="settings-heading">
      <h2 id="settings-heading">Settings</h2>

      <h3>Account</h3>
      {me ? (
        <div data-testid="account">
          <p data-testid="account-identity">
            Signed in as <strong>{me.user?.email ?? me.principal.displayName}</strong>
            {me.user?.fullName ? ` (${me.user.fullName})` : ''}.
          </p>
          <button type="button" onClick={() => void signOut(session)}>
            Sign out
          </button>
          <MfaSection session={session} />
        </div>
      ) : (
        <p data-testid="account-anonymous">
          You are browsing anonymously (read-only). <Link to="/signin">Sign in</Link> for your
          per-user view.
        </p>
      )}

      <h3>Backend</h3>
      <dl>
        <dt>Base URL</dt>
        <dd>{baseUrl}</dd>
        {capabilities.status === 'loading' && (
          <>
            <dt>Status</dt>
            <dd>Connecting…</dd>
          </>
        )}
        {capabilities.status === 'error' && (
          <>
            <dt>Status</dt>
            <dd role="alert">Error: {describeError(capabilities.error)}</dd>
          </>
        )}
        {capabilities.status === 'ready' && (
          <>
            <dt>Status</dt>
            <dd data-testid="backend-status">{capabilities.system.status ?? 'ok'}</dd>
            <dt>Backend version</dt>
            <dd data-testid="backend-version">{capabilities.system.version}</dd>
            <dt>API version</dt>
            <dd>
              {capabilities.version.actual ?? 'not reported'} (client built for{' '}
              {capabilities.version.expected})
            </dd>
            <dt>Contract version</dt>
            <dd>{capabilities.contract.contractVersion}</dd>
            <dt>Open reads</dt>
            <dd>
              {capabilities.system.security?.openReads === undefined
                ? 'not reported'
                : capabilities.system.security.openReads
                  ? 'on'
                  : 'off'}
            </dd>
          </>
        )}
      </dl>

      <h3>Access token</h3>
      <p data-testid="token-state">
        {token ? `A token is set (${token.slice(0, 8)}…).` : 'No token: using open reads.'}
      </p>
      <form onSubmit={saveToken}>
        <label>
          Token{' '}
          <input
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>{' '}
        <button type="submit" disabled={!draft.trim()}>
          Save token
        </button>{' '}
        <button
          type="button"
          disabled={!token}
          onClick={() => {
            session.tokens.clear();
            setMessage('Token cleared.');
          }}
        >
          Clear token
        </button>
      </form>

      <h3>Pair this browser</h3>
      <form onSubmit={claim}>
        <label>
          Pairing code{' '}
          <input
            placeholder="XXXX-XXXX"
            maxLength={9}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>{' '}
        <button type="submit" disabled={code.trim().length < 8}>
          Claim
        </button>
      </form>

      {message && <p role="status">{message}</p>}
    </section>
  );
}
