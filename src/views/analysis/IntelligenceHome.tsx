import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import { FsError } from '../../api/errors';
import { Badge } from '../../ui/Badge';
import { Panel } from '../../ui/Panel';
import { analysisPath, severityTone, statusTone, utcText } from '../../intel/analysisView';
import { listInvestigations, type Investigation } from '../../intel/investigationApi';
import { listSituations, type SituationSummary } from '../../intel/situationApi';
import { prettifyId } from '../../lib/labels';
import { AnalysisRail } from './AnalysisRail';
import styles from './Analysis.module.css';

type Loaded<T> =
  { status: 'loading' } | { status: 'ready'; items: T[] } | { status: 'error'; message: string };

/** What a failed list says; a 401 asks for a token. */
function failure(error: unknown, what: string): string {
  if (error instanceof FsError && error.status === 401) {
    return `${what} need an access token, even with open reads. Add one in Settings.`;
  }
  return error instanceof Error ? error.message : `${what} did not load.`;
}

const STATUSES: readonly SituationSummary['status'][] = ['emerging', 'active', 'dormant', 'closed'];

/**
 * The Intelligence tab's first screen (019): situations by latest activity (`listSituations`),
 * searchable and filtered by status, and the investigations the caller can see
 * (`listInvestigations`, which always needs a token). Each opens its full-analysis view.
 */
export function IntelligenceHome({ api }: { api?: ForesignalClient }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<ReadonlySet<SituationSummary['status']>>(
    new Set(['emerging', 'active']),
  );
  const [situations, setSituations] = useState<Loaded<SituationSummary>>({ status: 'loading' });
  const [investigations, setInvestigations] = useState<Loaded<Investigation>>({
    status: 'loading',
  });

  useEffect(() => {
    const timer = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    listSituations(api, { q: query || undefined, status: [...statuses] }, controller.signal).then(
      (items) => !controller.signal.aborted && setSituations({ status: 'ready', items }),
      (error: unknown) =>
        !controller.signal.aborted &&
        setSituations({ status: 'error', message: failure(error, 'Situations') }),
    );
    return () => controller.abort();
  }, [api, query, statuses]);

  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    listInvestigations(api, controller.signal).then(
      (items) => !controller.signal.aborted && setInvestigations({ status: 'ready', items }),
      (error: unknown) =>
        !controller.signal.aborted &&
        setInvestigations({ status: 'error', message: failure(error, 'Investigations') }),
    );
    return () => controller.abort();
  }, [api]);

  const toggle = (status: SituationSummary['status']) =>
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  const open = (ref: string) => {
    const path = analysisPath(ref);
    if (path) void navigate(path);
  };

  return (
    <div className={styles.frame} data-testid="intelligence-home">
      <AnalysisRail onHome={() => {}} atHome />
      <div className={styles.home}>
        <h1 className={styles.visuallyHidden}>Intelligence</h1>
        <Panel title="Situations">
          <div className={styles.homeBody}>
            <div className={styles.toolbar}>
              <input
                className={styles.input}
                type="search"
                aria-label="Search situations"
                placeholder="Search situations"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={styles.chip}
                  aria-pressed={statuses.has(status)}
                  onClick={() => toggle(status)}
                >
                  {prettifyId(status)}
                </button>
              ))}
            </div>
            {situations.status === 'loading' && <p className={styles.muted}>Loading…</p>}
            {situations.status === 'error' && (
              <p className={styles.error} role="alert">
                {situations.message}
              </p>
            )}
            {situations.status === 'ready' && situations.items.length === 0 && (
              <p className={styles.muted}>No situations match.</p>
            )}
            {situations.status === 'ready' && situations.items.length > 0 && (
              <ul className={styles.rows} aria-label="Situations">
                {situations.items.map((situation) => (
                  <li key={situation.id}>
                    <button
                      type="button"
                      className={styles.listRow}
                      onClick={() => open(`situation:${situation.id}`)}
                    >
                      <span className={styles.titleRow}>
                        <strong>{situation.title}</strong>
                        <Badge tone={statusTone(situation.status)}>{situation.status}</Badge>
                        <Badge tone={severityTone(situation.severity)}>{situation.severity}</Badge>
                      </span>
                      <span className={styles.listMeta}>
                        {prettifyId(situation.theme)} · {situation.memberCount} members · last
                        activity {utcText(situation.lastActivityAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
        <Panel title="Investigations">
          <div className={styles.homeBody}>
            {investigations.status === 'loading' && <p className={styles.muted}>Loading…</p>}
            {investigations.status === 'error' && (
              <p className={styles.error} role="alert">
                {investigations.message}
              </p>
            )}
            {investigations.status === 'ready' && investigations.items.length === 0 && (
              <p className={styles.muted}>No investigations yet.</p>
            )}
            {investigations.status === 'ready' && investigations.items.length > 0 && (
              <ul className={styles.rows} aria-label="Investigations">
                {investigations.items.map((investigation) => (
                  <li key={investigation.id}>
                    <button
                      type="button"
                      className={styles.listRow}
                      onClick={() => open(`investigation:${investigation.id}`)}
                    >
                      <span className={styles.titleRow}>
                        <strong>{investigation.title}</strong>
                        <Badge tone={statusTone(investigation.status)}>
                          {investigation.status}
                        </Badge>
                      </span>
                      <span className={styles.listMeta}>
                        {investigation.displayId} · {investigation.itemCount ?? 0} items · updated{' '}
                        {utcText(investigation.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
