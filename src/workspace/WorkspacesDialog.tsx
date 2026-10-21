import { useState, type FormEvent } from 'react';
import { utcText } from '../intel/analysisView';
import { useRead } from '../intel/useHypotheses';
import { useStoreKey, type AppState, type Store } from '../state/store';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { WorkspaceSync } from './WorkspaceSync';
import { listWorkspaces } from './workspaceApi';
import { linkUrl } from './workspaceContext';
import styles from './Workspaces.module.css';

/** What the dialog last did, for its status line. */
type Note = { tone: 'ok' | 'error'; text: string };

/** The message of a failure, with a token hint for a 401. */
function failure(error: unknown): string {
  const message = error instanceof Error ? error.message : 'That did not work.';
  return /token/i.test(message) ? `${message} Add an access token in Settings.` : message;
}

/**
 * The Workspaces dialog (025): the open workspace (its name, role and context version, with Copy
 * link, Share and Leave), the workspace a deep link came from, the caller's workspaces to open,
 * and a form to create one from what the app shows. Copy link works with no workspace open too.
 */
export function WorkspacesDialog({ sync, store }: { sync: WorkspaceSync; store: Store<AppState> }) {
  const open = useStoreKey('workspacesOpen', store);
  const active = useStoreKey('workspace', store);
  const [version, setVersion] = useState(0);
  const workspaces = useRead(
    sync.api,
    open ? `list#${version}` : undefined,
    (client, _key, signal) => listWorkspaces(client, signal),
  );
  const [name, setName] = useState('');
  const [note, setNote] = useState<Note>();
  const [link, setLink] = useState<string>();
  const [busy, setBusy] = useState(false);
  const close = () => store.set('workspacesOpen', false);

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setNote(undefined);
    try {
      const text = await action();
      if (text) setNote({ tone: 'ok', text });
    } catch (error) {
      setNote({ tone: 'error', text: failure(error) });
    } finally {
      setBusy(false);
    }
  };
  const copyLink = () =>
    run(async () => {
      const made = await sync.link();
      const url = linkUrl(window.location, made.fragment);
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        return 'Link copied.';
      } catch {
        return 'Copy the link below.';
      }
    });
  const share = () =>
    run(async () => {
      const made = await sync.share();
      setLink(made.url ?? undefined);
      return made.url
        ? `Read-only link made; it expires ${utcText(made.expiresAt)}.`
        : `Read-only link ${made.keyPrefix}… made; it expires ${utcText(made.expiresAt)}.`;
    });
  const create = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    void run(async () => {
      const made = await sync.create(trimmed);
      setName('');
      setVersion((value) => value + 1);
      return `Workspace ${made.name} created and open.`;
    });
  };
  const openOne = (id: string) =>
    run(async () => {
      const opened = await sync.open(id);
      return `Workspace ${opened.name} open.`;
    });

  return (
    <Modal open={open} title="Workspaces" onClose={close}>
      <div className={styles.dialog} data-testid="workspaces-dialog">
        <section aria-label="Open workspace">
          {active ? (
            <>
              <p className={styles.current}>
                <strong>{active.name}</strong>
                {active.role && <Badge uppercase={false}>{active.role}</Badge>}
                <span className={styles.muted}>context version {active.contextVersion}</span>
              </p>
              {active.error && (
                <p className={styles.error} role="alert">
                  Not saved: {active.error}
                </p>
              )}
            </>
          ) : (
            <p className={styles.muted}>
              No workspace is open: what you select and where you look stay on this screen.
            </p>
          )}
          <div className={styles.actions}>
            <Button onClick={() => void copyLink()} disabled={busy}>
              Copy link
            </Button>
            {active && (
              <>
                <Button onClick={() => void share()} disabled={busy}>
                  Share read-only
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    sync.leave();
                    setNote({ tone: 'ok', text: 'Left the workspace.' });
                  }}
                >
                  Leave
                </Button>
              </>
            )}
          </div>
          {link && (
            <input
              className={styles.link}
              readOnly
              aria-label="Link"
              value={link}
              onFocus={(event) => event.target.select()}
            />
          )}
          {note && (
            <p className={note.tone === 'error' ? styles.error : styles.muted} role="status">
              {note.text}
            </p>
          )}
        </section>

        {sync.linkedWorkspaceId && sync.linkedWorkspaceId !== active?.id && (
          <section aria-label="Linked workspace" className={styles.linked}>
            <span className={styles.muted}>The link you opened came from a workspace.</span>
            <Button onClick={() => void openOne(sync.linkedWorkspaceId ?? '')} disabled={busy}>
              Open it
            </Button>
          </section>
        )}

        <section aria-label="Your workspaces">
          <h3 className={styles.heading}>Your workspaces</h3>
          {workspaces.status === 'loading' && <p className={styles.muted}>Loading…</p>}
          {workspaces.status === 'error' && (
            <p className={styles.muted}>{failure(new Error(workspaces.message))}</p>
          )}
          {workspaces.status === 'ready' && workspaces.value.length === 0 && (
            <p className={styles.muted}>No workspaces yet.</p>
          )}
          {workspaces.status === 'ready' && workspaces.value.length > 0 && (
            <ul className={styles.list}>
              {workspaces.value.map((workspace) => (
                <li key={workspace.id} className={styles.row}>
                  <span className={styles.rowText}>
                    <strong>{workspace.name}</strong>
                    <span className={styles.muted}>
                      {workspace.callerRole ?? 'member'} · updated {utcText(workspace.updatedAt)}
                    </span>
                  </span>
                  {workspace.id === active?.id ? (
                    <Badge tone="success" uppercase={false}>
                      open
                    </Badge>
                  ) : (
                    <Button onClick={() => void openOne(workspace.id)} disabled={busy}>
                      Open
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <form className={styles.create} onSubmit={create} aria-label="New workspace">
          <input
            className={styles.input}
            placeholder="New workspace name"
            aria-label="New workspace name"
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            Create from this view
          </Button>
        </form>
      </div>
    </Modal>
  );
}
