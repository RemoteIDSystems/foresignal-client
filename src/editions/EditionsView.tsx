import { Link } from 'react-router';
import { useMe } from '../api/useMe';
import { useRead } from '../intel/useHypotheses';
import { utcText } from '../intel/analysisView';
import { Badge, type BadgeTone } from '../ui/Badge';
import type { Session } from '../app/session';
import { listMyEditions, type EditionSummary } from './editionsApi';
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
      </section>
      <EditionsList session={session} />
    </div>
  );
}

/** The list of the caller's editions, loaded from `listMyEditions`. */
function EditionsList({ session }: { session: Session }) {
  const result = useRead(session.api, 'my-editions', (client, _key, signal) =>
    listMyEditions(client, {}, signal),
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
          <EditionRow key={edition.briefingId} edition={edition} />
        ))}
      </ul>
    </section>
  );
}

/** One edition in the list, linking to its reader. */
function EditionRow({ edition }: { edition: EditionSummary }) {
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
    </li>
  );
}
