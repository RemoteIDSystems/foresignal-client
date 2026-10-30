import { useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../api/useMe';
import { useCan } from '../auth/permissions';
import { useRead } from '../intel/useHypotheses';
import { utcText } from '../intel/analysisView';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useToast } from '../ui/toast-context';
import type { Session } from '../app/session';
import { deleteMyEdition, listMyEditions, runMyEdition, type EditionSummary } from './editionsApi';
import styles from '../account/AccountView.module.css';
import editions from './Editions.module.css';

/** The badge tone for a run status word (`ok`/`success` → green, `failed`/`error` → red). */
function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return 'neutral';
  const lower = status.toLowerCase();
  if (lower.includes('ok') || lower.includes('success') || lower === 'done') return 'success';
  if (lower.includes('fail') || lower.includes('error')) return 'danger';
  if (lower.includes('run') || lower.includes('pending') || lower.includes('queue')) return 'info';
  return 'neutral';
}

/**
 * The Editions area (NP-002): the signed-in user's automated newspapers. Lists each edition the
 * caller owns (`listMyEditions`) with a link to read and listen to it; an anonymous visitor gets a
 * sign-in affordance rather than a dead end. Presentation only — scheduling, translation and
 * delivery live in the backend and are configured in the admin console.
 */
export function EditionsView({ session }: { session: Session }) {
  const me = useMe();
  if (!me) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Editions</h1>
          <p className={styles.muted}>
            Your automated newspaper lives here. <Link to="/signin">Sign in</Link> to read and
            listen to your editions.
          </p>
        </section>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <section className={styles.card} aria-label="Editions">
        <div className={styles.head}>
          <h1 className={styles.title}>Editions</h1>
          <Link to="/account">Account</Link>
        </div>
        <p className={styles.muted}>
          Your automated newspaper, written and spoken. Each edition is scheduled, translated and
          delivered by the backend; this is where you read and listen to it. Your output language
          lives in your <Link to="/account">preferences</Link>, and which sources feed it in{' '}
          <Link to="/account/sources">your sources</Link>.
        </p>
        <NewEditionAction />
      </section>
      <EditionsList session={session} />
    </div>
  );
}

/** The "New edition" affordance, shown only to a user who may build editions (`self.editions`). */
function NewEditionAction() {
  const can = useCan();
  if (!can('self.editions')) return null;
  return (
    <div className={styles.actions}>
      <Link to="/editions/new">
        <Button type="button" variant="primary">
          New edition
        </Button>
      </Link>
    </div>
  );
}

/** The list of the caller's editions, loaded from `listMyEditions`. */
function EditionsList({ session }: { session: Session }) {
  const can = useCan();
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const result = useRead(
    session.api,
    'my-editions',
    (client, _key, signal) => listMyEditions(client, {}, signal),
    version,
  );
  if (result.status === 'loading') {
    return (
      <section className={styles.card}>
        <p className={styles.muted}>Loading your editions…</p>
      </section>
    );
  }
  if (result.status === 'error') {
    return (
      <section className={styles.card}>
        <p className={styles.muted}>Your editions did not load.</p>
      </section>
    );
  }
  const items = result.value.items;
  if (items.length === 0) {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>No editions yet</h2>
        <p className={styles.muted}>
          You have no editions. An edition is composed in the admin console; once one is yours, it
          appears here to read and listen to.
        </p>
      </section>
    );
  }
  return (
    <section className={styles.card} aria-label="Your editions">
      <ul className={editions.list}>
        {items.map((edition) => (
          <EditionRow
            key={edition.briefingId}
            session={session}
            edition={edition}
            canManage={can('self.editions')}
            onChanged={refresh}
          />
        ))}
      </ul>
    </section>
  );
}

/** One edition in the list: a link to its reader, plus manage actions when the user may build editions. */
function EditionRow({
  session,
  edition,
  canManage,
  onChanged,
}: {
  session: Session;
  edition: EditionSummary;
  canManage: boolean;
  onChanged: () => void;
}) {
  return (
    <li className={editions.row}>
      <Link to={`/editions/${edition.briefingId}`} className={editions.rowLink}>
        <span className={editions.rowHead}>
          <span className={editions.rowName}>{edition.name}</span>
          {!edition.enabled && (
            <Badge tone="neutral" uppercase={false}>
              Paused
            </Badge>
          )}
          {edition.outputLanguage && (
            <Badge tone="info" uppercase={false}>
              {edition.outputLanguage}
            </Badge>
          )}
          {edition.lastRunStatus && (
            <Badge tone={statusTone(edition.lastRunStatus)} uppercase={false}>
              {edition.lastRunStatus}
            </Badge>
          )}
        </span>
        <span className={styles.muted}>
          {edition.lastRunAt
            ? `Last edition ${utcText(edition.lastRunAt)}`
            : 'No edition published yet'}
          {edition.schedule ? ` · ${edition.schedule} (${edition.timezone})` : ''}
        </span>
      </Link>
      {canManage && <EditionRowActions session={session} edition={edition} onChanged={onChanged} />}
    </li>
  );
}

/** The manage actions for one edition (`self.editions`): edit, run now and delete. */
function EditionRowActions({
  session,
  edition,
  onChanged,
}: {
  session: Session;
  edition: EditionSummary;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<null | 'run' | 'delete'>(null);

  const run = async () => {
    setBusy('run');
    try {
      await runMyEdition(session.api, edition.briefingId);
      toast.show({ title: `Running “${edition.name}” now.`, tone: 'success' });
      onChanged();
    } catch (error) {
      toast.show({
        title: error instanceof Error ? error.message : 'The run did not start.',
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${edition.name}”? This cannot be undone.`)) return;
    setBusy('delete');
    try {
      await deleteMyEdition(session.api, edition.briefingId);
      toast.show({ title: `Deleted “${edition.name}”.`, tone: 'success' });
      onChanged();
    } catch (error) {
      toast.show({
        title: error instanceof Error ? error.message : 'The edition was not deleted.',
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={editions.rowActions}>
      <Link to={`/editions/${edition.briefingId}/edit`}>
        <Button type="button">Edit</Button>
      </Link>
      <Button type="button" onClick={run} disabled={busy !== null}>
        {busy === 'run' ? 'Starting…' : 'Run now'}
      </Button>
      <Button type="button" onClick={remove} disabled={busy !== null}>
        {busy === 'delete' ? 'Deleting…' : 'Delete'}
      </Button>
    </div>
  );
}
