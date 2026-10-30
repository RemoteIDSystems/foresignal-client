import { Link, useParams } from 'react-router';
import { useMe } from '../api/useMe';
import { useRead } from '../intel/useHypotheses';
import { utcText } from '../intel/analysisView';
import { Markdown } from '../ui/markdown/Markdown';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useToast } from '../ui/toast-context';
import type { Session } from '../app/session';
import {
  getBriefingPodcast,
  getEditionSite,
  getLatestBriefingRun,
  latestEnclosure,
  shareUrlOf,
  type BriefingRun,
  type EditionCitation,
} from './editionsApi';
import styles from '../account/AccountView.module.css';
import editions from './Editions.module.css';

/** Evidence-quality word → badge tone for the corroboration badge. */
const QUALITY_TONE: Record<string, BadgeTone> = {
  strong: 'success',
  moderate: 'info',
  weak: 'warning',
  insufficient: 'danger',
};

/**
 * The edition reader (NP-002): a signed-in user reads the current written edition and plays the
 * spoken one, with per-item provenance ("why this is in my paper") and corroboration badges when the
 * edition carries them, and a copy affordance for the edition's shareable read-only URL. Anonymous
 * visitors get a sign-in affordance.
 */
export function EditionView({ session }: { session: Session }) {
  const { briefingId } = useParams();
  const me = useMe();
  if (!me) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Edition</h1>
          <p className={styles.muted}>
            <Link to="/signin">Sign in</Link> to read and listen to your edition.
          </p>
        </section>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.head}>
          <h1 className={styles.title}>Edition</h1>
          <Link to="/editions">Back to editions</Link>
        </div>
      </section>
      {briefingId ? (
        <EditionReader session={session} briefingId={briefingId} />
      ) : (
        <section className={styles.card}>
          <p className={styles.muted}>No edition selected.</p>
        </section>
      )}
    </div>
  );
}

/** The loaded reader for one edition: written body, spoken player, badges and share. */
function EditionReader({ session, briefingId }: { session: Session; briefingId: string }) {
  const run = useRead(session.api, `run:${briefingId}`, (client, _key, signal) =>
    getLatestBriefingRun(client, briefingId, signal),
  );

  if (run.status === 'loading') {
    return (
      <section className={styles.card}>
        <p className={styles.muted}>Loading your edition…</p>
      </section>
    );
  }
  if (run.status === 'error') {
    return (
      <section className={styles.card}>
        <p className={styles.muted}>
          This edition did not load — it may have no published run yet.
        </p>
      </section>
    );
  }
  return (
    <>
      <WrittenEdition run={run.value} />
      <SpokenEdition session={session} briefingId={briefingId} />
      <Provenance citations={run.value.citations ?? []} />
      <ShareEdition session={session} briefingId={briefingId} />
    </>
  );
}

/** The written edition: the run's Markdown body, with the breaking-news and period context. */
function WrittenEdition({ run }: { run: BriefingRun }) {
  return (
    <section className={styles.card} aria-label="Written edition">
      <div className={editions.editionHead}>
        {run.breaking && (
          <Badge tone="danger" uppercase={false}>
            Breaking
          </Badge>
        )}
        <span className={styles.muted}>
          {utcText(run.periodFrom)} – {utcText(run.periodTo)}
        </span>
      </div>
      {run.contentMarkdown ? (
        <Markdown source={run.contentMarkdown} />
      ) : (
        <p className={styles.muted}>This edition has no written text.</p>
      )}
    </section>
  );
}

/**
 * The spoken edition: an audio player for the latest enclosure in the edition's podcast feed. The
 * feed is loaded and parsed; when it has no audio (or does not load), the player is omitted cleanly.
 */
function SpokenEdition({ session, briefingId }: { session: Session; briefingId: string }) {
  const feed = useRead(session.api, `podcast:${briefingId}`, (client, _key, signal) =>
    getBriefingPodcast(client, briefingId, signal),
  );
  if (feed.status !== 'ready') return null;
  const enclosure = latestEnclosure(feed.value);
  if (!enclosure) return null;
  return (
    <section className={styles.card} aria-label="Spoken edition">
      <h2 className={styles.cardTitle}>Listen</h2>
      {enclosure.title && <p className={styles.muted}>{enclosure.title}</p>}
      <audio className={editions.player} controls preload="none" src={enclosure.url}>
        Your browser cannot play this audio.{' '}
        <a href={enclosure.url} target="_blank" rel="noopener noreferrer">
          Download it
        </a>
        .
      </audio>
    </section>
  );
}

/**
 * The provenance and corroboration of the edition's items, from the run's citations. Each badge is
 * shown only when the run carries it (a briefing with `includeProvenance` / `includeCorroboration`),
 * and the whole section is omitted when there are no citations.
 */
function Provenance({ citations }: { citations: readonly EditionCitation[] }) {
  if (citations.length === 0) return null;
  return (
    <section className={styles.card} aria-label="Provenance and corroboration">
      <h2 className={styles.cardTitle}>Why this is in my paper</h2>
      <ul className={editions.citations}>
        {citations.map((citation, i) => (
          <li key={citation.id || i} className={editions.citation}>
            <span className={editions.citationHead}>
              <strong>{citation.title}</strong>
              <Corroboration citation={citation} />
            </span>
            <ProvenanceReason citation={citation} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The corroboration badge for one citation, or nothing when the run carries no corroboration. */
function Corroboration({ citation }: { citation: EditionCitation }) {
  const corroboration = citation.corroboration;
  if (!corroboration) return null;
  const quality = corroboration.evidenceQuality;
  const sources = corroboration.independentSources;
  const reliability = corroboration.reliability;
  const credibility = corroboration.credibility;
  return (
    <span className={editions.badges}>
      <Badge tone={QUALITY_TONE[quality] ?? 'neutral'} uppercase={false}>
        {quality}
      </Badge>
      <span className={styles.muted}>
        {sources} independent {sources === 1 ? 'source' : 'sources'}
        {reliability ? ` · reliability ${reliability}` : ''}
        {credibility != null ? ` · credibility ${credibility}` : ''}
      </span>
    </span>
  );
}

/** The "why included" reason and evidence-count for one citation, when the run carries provenance. */
function ProvenanceReason({ citation }: { citation: EditionCitation }) {
  const provenance = citation.provenance;
  if (!provenance) return null;
  const refs = provenance.refs ?? [];
  return (
    <span className={styles.muted}>
      {provenance.reason ? `${provenance.reason} ` : ''}
      {refs.length > 0 &&
        `(${refs.length} linked ${refs.length === 1 ? 'item' : 'items'} of evidence)`}
    </span>
  );
}

/** The share affordance: copies the edition's read-only share URL (or canonical site URL). */
function ShareEdition({ session, briefingId }: { session: Session; briefingId: string }) {
  const site = useRead(session.api, `site:${briefingId}`, (client, _key, signal) =>
    getEditionSite(client, briefingId, signal),
  );
  const toast = useToast();
  if (site.status !== 'ready') return null;
  const url = shareUrlOf(site.value);
  if (!url) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ title: 'Share link copied.', tone: 'success' });
    } catch {
      toast.show({ title: 'Copy it from the field below.', tone: 'warning' });
    }
  };
  return (
    <section className={styles.card} aria-label="Share">
      <h2 className={styles.cardTitle}>Share</h2>
      <p className={styles.muted}>A read-only link to this edition. Anyone with it can read it.</p>
      <div className={editions.shareRow}>
        <input
          className={editions.shareInput}
          type="text"
          readOnly
          value={url}
          aria-label="Share link"
        />
        <Button type="button" variant="primary" onClick={copy}>
          Copy link
        </Button>
      </div>
    </section>
  );
}
