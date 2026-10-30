import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Copy } from 'lucide-react';
import { useMe } from '../api/useMe';
import { AccessNotice } from '../auth/AccessNotice';
import type { Session } from '../app/session';
import { utcText } from '../intel/analysisView';
import { useRead } from '../intel/useHypotheses';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { useToast } from '../ui/toast-context';
import {
  createMyToken,
  listMyTokens,
  revokeMyToken,
  TOKEN_SCOPES,
  type ApiTokenCreated,
  type TokenScope,
} from './apiTokens';
import { listSessions, revokeAllSessions, revokeSession } from './sessions';
import styles from './AccountView.module.css';
import security from './SecurityView.module.css';

/**
 * The Account security screen (R2-008): the signed-in user's active sessions (revoke one or sign
 * out everywhere) and their personal API tokens (list, mint showing the secret once, revoke). Open
 * to any signed-in user; anonymous visitors are sent to sign in.
 */
export function SecurityView({ session }: { session: Session }) {
  const me = useMe();
  if (!me) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Security</h1>
          <p className={styles.muted}>
            You are browsing anonymously. <Link to="/signin">Sign in</Link> to manage your sessions
            and API tokens.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-label="Security">
        <div className={styles.head}>
          <h1 className={styles.title}>Security</h1>
          <Link to="/account">Back to account</Link>
        </div>
        <p className={styles.muted}>Your active sign-in sessions and personal API tokens.</p>
      </section>
      <SessionsSection session={session} />
      <TokensSection session={session} />
    </div>
  );
}

/** The active-sessions list, with per-session revoke and a guarded "sign out everywhere". */
function SessionsSection({ session }: { session: Session }) {
  const { api } = session;
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const page = useRead(api, `sessions#${version}`, (client, _key, signal) =>
    listSessions(client, signal),
  );

  const reload = () => setVersion((current) => current + 1);
  const revokeOne = async (id: string) => {
    setBusy(true);
    try {
      await revokeSession(api, id);
      toast.show({ title: 'Session revoked.', tone: 'success' });
      reload();
    } catch {
      toast.show({ title: 'Could not revoke the session.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const signOutEverywhere = async () => {
    setBusy(true);
    try {
      await revokeAllSessions(api);
      // This revoked the current session too: drop the local credential so the app is anonymous.
      session.sessions.clear();
      toast.show({ title: 'Signed out everywhere.', tone: 'success' });
    } catch {
      toast.show({ title: 'Could not sign out everywhere.', tone: 'danger' });
    } finally {
      setBusy(false);
      setConfirmAll(false);
    }
  };

  return (
    <section className={styles.card} aria-label="Sessions">
      <h2 className={styles.cardTitle}>Active sessions</h2>
      {page.status === 'loading' && <p className={styles.muted}>Loading your sessions…</p>}
      {page.status === 'error' && <p className={styles.muted}>Your sessions did not load.</p>}
      {page.status === 'ready' &&
        (page.value.items.length === 0 ? (
          <p className={styles.muted}>No active sessions.</p>
        ) : (
          <ul className={security.list}>
            {page.value.items.map((item) => (
              <li key={item.id} className={security.row}>
                <div className={security.rowMain}>
                  <span className={security.rowTitle}>
                    {item.userAgent ?? 'Unknown device'}
                    {item.current && (
                      <Badge tone="success" uppercase={false}>
                        This session
                      </Badge>
                    )}
                  </span>
                  <span className={styles.muted}>
                    {item.ipAddress ?? 'IP unknown'} · started {utcText(item.createdAt)}
                    {item.lastSeenAt ? ` · last seen ${utcText(item.lastSeenAt)}` : ''} · expires{' '}
                    {utcText(item.expiresAt)}
                  </span>
                </div>
                {item.current ? (
                  // Guard: do not revoke the current session from under the open app; use
                  // "sign out everywhere" (which clears the local credential) instead.
                  <span className={styles.muted}>In use</span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void revokeOne(item.id)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}
      <div className={styles.actions}>
        {confirmAll ? (
          <>
            <span className={styles.muted}>This signs you out on this device too.</span>
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => void signOutEverywhere()}
            >
              Confirm sign out everywhere
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmAll(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" disabled={busy} onClick={() => setConfirmAll(true)}>
            Sign out everywhere
          </Button>
        )}
      </div>
    </section>
  );
}

/** The personal-token list, the create form, and the one-time secret reveal. */
function TokensSection({ session }: { session: Session }) {
  const { api } = session;
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TokenScope>('read');
  const [expiresAt, setExpiresAt] = useState('');
  const [created, setCreated] = useState<ApiTokenCreated | null>(null);
  const [error, setError] = useState<unknown>(null);
  const tokens = useRead(api, `tokens#${version}`, (client, _key, signal) =>
    listMyTokens(client, signal),
  );

  const reload = () => setVersion((current) => current + 1);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createMyToken(api, {
        name: name.trim(),
        scope,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        // The contract's documented default; this screen does not grant private-source access.
        privateAccess: false,
      });
      // The secret is held only in component state and shown once; it is never persisted.
      setCreated(result);
      setName('');
      setExpiresAt('');
      setScope('read');
      reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await revokeMyToken(api, id);
      toast.show({ title: 'Token revoked.', tone: 'success' });
      reload();
    } catch {
      toast.show({ title: 'Could not revoke the token.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const copySecret = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      toast.show({ title: 'Token copied.', tone: 'success' });
    } catch {
      toast.show({ title: 'Copy it from the field above.', tone: 'warning' });
    }
  };

  return (
    <section className={styles.card} aria-label="API tokens">
      <h2 className={styles.cardTitle}>Personal API tokens</h2>

      {created && (
        <div className={security.secret} role="status">
          <p className={security.secretWarn}>
            Copy this token now — it is shown once and cannot be retrieved again.
          </p>
          <div className={security.secretRow}>
            <input
              type="text"
              readOnly
              value={created.token}
              aria-label="New API token secret"
              className={security.secretInput}
            />
            <IconButton
              label="Copy token"
              icon={<Copy size={16} />}
              onClick={() => void copySecret()}
            />
          </div>
          <Button type="button" variant="ghost" onClick={() => setCreated(null)}>
            Done
          </Button>
        </div>
      )}

      <form className={security.createForm} onSubmit={create}>
        <label className={styles.field}>
          <span>Name</span>
          <input
            type="text"
            maxLength={200}
            placeholder="e.g. Laptop CLI"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Scope</span>
          <select value={scope} onChange={(event) => setScope(event.target.value as TokenScope)}>
            {TOKEN_SCOPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Expires (optional)</span>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create token'}
          </Button>
        </div>
      </form>
      {error !== null && <AccessNotice error={error} />}

      {tokens.status === 'loading' && <p className={styles.muted}>Loading your tokens…</p>}
      {tokens.status === 'error' && <p className={styles.muted}>Your tokens did not load.</p>}
      {tokens.status === 'ready' &&
        (tokens.value.length === 0 ? (
          <p className={styles.muted}>No personal tokens.</p>
        ) : (
          <ul className={security.list}>
            {tokens.value.map((token) => {
              const revoked = Boolean(token.revokedAt);
              return (
                <li key={token.id} className={security.row}>
                  <div className={security.rowMain}>
                    <span className={security.rowTitle}>
                      {token.name}
                      <Badge tone="info">{token.scope}</Badge>
                      {revoked && (
                        <Badge tone="danger" uppercase={false}>
                          Revoked
                        </Badge>
                      )}
                    </span>
                    <span className={styles.muted}>
                      {token.tokenPrefix ?? '—'}… · created {utcText(token.createdAt)}
                      {token.lastUsedAt ? ` · last used ${utcText(token.lastUsedAt)}` : ''}
                      {token.expiresAt ? ` · expires ${utcText(token.expiresAt)}` : ''}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy || revoked}
                    onClick={() => void revoke(token.id)}
                  >
                    Revoke
                  </Button>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
