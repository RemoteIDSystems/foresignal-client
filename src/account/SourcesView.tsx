import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { useMe } from '../api/useMe';
import { AccessNotice } from '../auth/AccessNotice';
import { useCan } from '../auth/permissions';
import type { Session } from '../app/session';
import { utcText } from '../intel/analysisView';
import { useRead } from '../intel/useHypotheses';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { getMyLlmBudget, getMyQuota, type Quota } from './quota';
import {
  analyzeTriggerSources,
  type RelevanceVerdict,
  type SourceRelevanceAnalysis,
} from './sourceRelevance';
import { updateMySources, type UserSourcePref } from './sources';
import styles from './AccountView.module.css';
import sourcesCss from './SourcesView.module.css';

const DEFAULT_COLOR = '#24a8fc';

/** The badge tone for a relevance verdict. */
const VERDICT_TONE: Record<RelevanceVerdict, BadgeTone> = {
  relevant: 'success',
  marginal: 'warning',
  'not-meaningful': 'danger',
  unrated: 'neutral',
};

/**
 * The Account sources screen (R2-009): the signed-in user's per-user source view (visibility and
 * styling over the shared collection), their quota/usage and LLM budget, and the advisory
 * source-relevance analysis. Each section is gated by its `self.*` permission.
 */
export function SourcesView({ session }: { session: Session }) {
  const me = useMe();
  const can = useCan();
  if (!me) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>My sources</h1>
          <p className={styles.muted}>
            You are browsing anonymously. <Link to="/signin">Sign in</Link> to manage your sources.
          </p>
        </section>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <section className={styles.card} aria-label="My sources">
        <div className={styles.head}>
          <h1 className={styles.title}>My sources</h1>
          <Link to="/account">Back to account</Link>
        </div>
        <p className={styles.muted}>
          Your view over the shared collection: which sources you see, how they are labeled and
          colored, your quota and LLM budget, and advisory relevance.
        </p>
      </section>
      {can('self.sources') ? (
        <MySourcesEditor session={session} />
      ) : (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Sources</h2>
          <p className={styles.muted}>Your role does not include managing your sources.</p>
        </section>
      )}
      <QuotaPanel session={session} />
      {can('self.llm') && <LlmBudgetPanel session={session} />}
      {can('self.alerts') && <RelevancePanel session={session} />}
    </div>
  );
}

/** The per-user source view editor: enable, label and color each source over the shared collection. */
function MySourcesEditor({ session }: { session: Session }) {
  const stored = useSyncExternalStore(session.userSources.subscribe, session.userSources.get);
  const [edited, setEdited] = useState<UserSourcePref[] | null>(null);
  const [status, setStatus] = useState<
    { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; error: unknown }
  >({ kind: 'idle' });

  useEffect(() => {
    if (!stored) void session.userSources.load(session.api);
  }, [stored, session]);

  const rows = edited ?? stored?.sources ?? null;
  if (!rows) {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Sources</h2>
        <p className={styles.muted}>Loading your sources…</p>
      </section>
    );
  }

  const patch = (index: number, next: Partial<UserSourcePref>) => {
    setEdited(rows.map((row, i) => (i === index ? { ...row, ...next } : row)));
    setStatus({ kind: 'idle' });
  };
  const save = async () => {
    setStatus({ kind: 'saving' });
    try {
      const result = await updateMySources(session.api, rows);
      session.userSources.set(result);
      setEdited(null);
      setStatus({ kind: 'saved' });
    } catch (error) {
      setStatus({ kind: 'error', error });
    }
  };

  return (
    <section className={styles.card} aria-label="Source view">
      <h2 className={styles.cardTitle}>Source view</h2>
      {rows.length === 0 ? (
        <p className={styles.muted}>No sources in the shared collection.</p>
      ) : (
        <ul className={sourcesCss.sources}>
          {rows.map((row, index) => (
            <li key={row.sourceId} className={sourcesCss.source}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(event) => patch(index, { enabled: event.target.checked })}
                  aria-label={`Show ${row.sourceId}`}
                />
                <span className={sourcesCss.sourceId}>{row.sourceId}</span>
              </label>
              <input
                type="text"
                className={sourcesCss.nameInput}
                placeholder={row.sourceId}
                value={row.displayName ?? ''}
                onChange={(event) => patch(index, { displayName: event.target.value || null })}
                aria-label={`Display name for ${row.sourceId}`}
              />
              <label className={sourcesCss.colorField}>
                <input
                  type="checkbox"
                  checked={row.color !== null && row.color !== undefined}
                  onChange={(event) =>
                    patch(index, { color: event.target.checked ? DEFAULT_COLOR : null })
                  }
                  aria-label={`Custom color for ${row.sourceId}`}
                />
                <input
                  type="color"
                  disabled={row.color === null || row.color === undefined}
                  value={row.color ?? DEFAULT_COLOR}
                  onChange={(event) => patch(index, { color: event.target.value })}
                  aria-label={`Color for ${row.sourceId}`}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <Button type="button" variant="primary" disabled={status.kind === 'saving'} onClick={save}>
          {status.kind === 'saving' ? 'Saving…' : 'Save source view'}
        </Button>
        {status.kind === 'saved' && (
          <span className={styles.ok} role="status">
            Saved. Disabled sources are hidden from your map and views.
          </span>
        )}
      </div>
      {status.kind === 'error' && <AccessNotice error={status.error} />}
    </section>
  );
}

/** A single quota limit paired with its current usage. */
function limitRow(label: string, used: unknown, limit: number | null | undefined) {
  const usedText = typeof used === 'number' ? used.toLocaleString('en-US') : '—';
  const limitText =
    limit === null || limit === undefined ? 'unlimited' : limit.toLocaleString('en-US');
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {usedText} / {limitText}
      </dd>
    </>
  );
}

/** The read-only quota and usage panel. */
function QuotaPanel({ session }: { session: Session }) {
  const quota = useRead(session.api, 'quota', (client, _key, signal) => getMyQuota(client, signal));
  return (
    <section className={styles.card} aria-label="Quota and usage">
      <h2 className={styles.cardTitle}>Quota and usage</h2>
      {quota.status === 'loading' && <p className={styles.muted}>Loading your quota…</p>}
      {quota.status === 'error' && <p className={styles.muted}>Your quota did not load.</p>}
      {quota.status === 'ready' &&
        (() => {
          const { quota: q, usage } = quota.value;
          const use = usage as Record<string, unknown>;
          const limits = q as Quota;
          return (
            <dl className={styles.profile}>
              {limitRow('Trigger rules', use.alerts, limits.maxAlerts)}
              {limitRow('Channels', use.channels, limits.maxChannels)}
              {limitRow('Saved views', use.savedViews, limits.maxSavedViews)}
              {limitRow('Storage (bytes)', use.storageBytes, limits.maxStorageBytes)}
              {limitRow(
                'API requests/min',
                use.apiRequestsThisMinute,
                limits.apiRateLimitPerMinute,
              )}
            </dl>
          );
        })()}
    </section>
  );
}

/** The personal LLM budget panel. */
function LlmBudgetPanel({ session }: { session: Session }) {
  const budget = useRead(session.api, 'llm-budget', (client, _key, signal) =>
    getMyLlmBudget(client, signal),
  );
  return (
    <section className={styles.card} aria-label="LLM budget">
      <h2 className={styles.cardTitle}>LLM budget</h2>
      {budget.status === 'loading' && <p className={styles.muted}>Loading your budget…</p>}
      {budget.status === 'error' && <p className={styles.muted}>Your budget did not load.</p>}
      {budget.status === 'ready' && (
        <>
          <p>
            Spent this month: <strong>${budget.value.totalSpentUsd.toFixed(2)}</strong>
            {budget.value.asOf ? (
              <span className={styles.muted}> · as of {utcText(budget.value.asOf)}</span>
            ) : null}
          </p>
          {budget.value.providers.length === 0 ? (
            <p className={styles.muted}>No providers.</p>
          ) : (
            <ul className={sourcesCss.providers}>
              {budget.value.providers.map((provider) => (
                <li key={provider.providerId} className={sourcesCss.provider}>
                  <span className={sourcesCss.providerName}>
                    {provider.name}
                    <Badge tone={provider.shared ? 'info' : 'teal'} uppercase={false}>
                      {provider.shared ? 'Shared' : 'Personal'}
                    </Badge>
                  </span>
                  <span className={styles.muted}>
                    ${provider.spentUsd.toFixed(2)} spent
                    {provider.capUsd != null ? ` · $${provider.capUsd.toFixed(2)} cap` : ''}
                    {provider.remainingUsd != null
                      ? ` · $${provider.remainingUsd.toFixed(2)} left`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** The advisory source-relevance analysis, run over the user's currently enabled sources. */
function RelevancePanel({ session }: { session: Session }) {
  const view = useSyncExternalStore(session.userSources.subscribe, session.userSources.get);
  const enabledIds = (view?.sources ?? [])
    .filter((source) => source.enabled)
    .map((source) => source.sourceId);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SourceRelevanceAnalysis | null>(null);
  const [error, setError] = useState<unknown>(null);

  const tooFew = enabledIds.length < 2;
  const tooMany = enabledIds.length > 50;
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await analyzeTriggerSources(session.api, enabledIds));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-label="Source relevance">
      <h2 className={styles.cardTitle}>Source relevance</h2>
      <p className={styles.muted}>
        An advisory read of how well your {enabledIds.length} enabled sources fit together. It
        changes nothing — you decide what to keep on.
      </p>
      <div className={styles.actions}>
        <Button type="button" variant="primary" disabled={busy || tooFew || tooMany} onClick={run}>
          {busy ? 'Analyzing…' : 'Analyze my enabled sources'}
        </Button>
        {tooFew && <span className={styles.muted}>Enable at least two sources to analyze.</span>}
        {tooMany && <span className={styles.muted}>Analyze at most 50 sources at once.</span>}
      </div>
      {error !== null && <AccessNotice error={error} />}
      {result && (
        <div className={sourcesCss.relevance}>
          {result.summary && <p>{result.summary}</p>}
          <ul className={sourcesCss.verdicts}>
            {result.sources.map((source) => (
              <li key={source.sourceId} className={sourcesCss.verdict}>
                <span className={sourcesCss.verdictHead}>
                  <strong>{source.name}</strong>
                  <Badge tone={VERDICT_TONE[source.verdict]} uppercase={false}>
                    {source.verdict}
                  </Badge>
                </span>
                <span className={styles.muted}>{source.reason}</span>
              </li>
            ))}
          </ul>
          {result.model && <p className={styles.muted}>Model: {result.model}</p>}
        </div>
      )}
    </section>
  );
}
