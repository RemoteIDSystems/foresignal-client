import { utcText } from '../intel/analysisView';
import analysis from '../views/analysis/Analysis.module.css';
import type { TriggerTestResult } from './triggerApi';
import styles from './Rules.module.css';

/** How many matches and window evaluations the preview lists. */
const SHOWN = 10;

/** A match's headline: its payload's title or name when it has one, else its external id. */
function matchTitle(match: TriggerTestResult['matches'][number]): string {
  const payload = match.payload as { title?: unknown; name?: unknown; place?: unknown };
  for (const value of [payload.title, payload.name, payload.place]) {
    if (typeof value === 'string' && value) return value;
  }
  return match.externalId;
}

/**
 * What a dry run (`testTrigger`, simulated) found over stored data: how many versions matched,
 * how many alerts would have fired and been suppressed, the backend's warnings, the first matches
 * and, for a windowed rule, the latest window evaluations. Nothing here is computed by the client.
 */
export function DryRunResult({ result, since }: { result: TriggerTestResult; since: string }) {
  const evaluations = result.windowEvaluations ?? [];
  return (
    <section className={styles.dryRun} aria-label="Dry run result">
      <dl className={styles.summary}>
        <div>
          <dt>Matches</dt>
          <dd>
            {result.matchCount ?? result.matches.length}
            {result.truncated ? '+' : ''}
          </dd>
        </div>
        <div>
          <dt>Would fire</dt>
          <dd>{result.wouldFire ?? '—'}</dd>
        </div>
        <div>
          <dt>Would suppress</dt>
          <dd>{result.wouldSuppress ?? '—'}</dd>
        </div>
      </dl>
      <p className={analysis.muted}>
        Since {utcText(result.evaluatedFrom ?? since)}
        {result.simulated ? ', with cooldown, snooze, storm cap and active window' : ''}
        {result.approximate
          ? `; approximate${result.approximateReason ? `: ${result.approximateReason}` : ''}`
          : ''}
        {result.truncatedByRetention ? '; starts before the retained history' : ''}.
      </p>
      {result.warnings?.map((warning) => (
        <p key={warning.code} className={styles.warning}>
          {warning.code}: {warning.message}
        </p>
      ))}
      {result.matches.length > 0 ? (
        <div className={analysis.tableWrap}>
          <table className={analysis.table}>
            <caption className={analysis.visuallyHidden}>Matching records</caption>
            <thead>
              <tr>
                <th scope="col">Observed</th>
                <th scope="col">Kind</th>
                <th scope="col">Source</th>
                <th scope="col">Record</th>
              </tr>
            </thead>
            <tbody>
              {result.matches.slice(0, SHOWN).map((match) => (
                <tr key={`${match.id}-${match.version}`}>
                  <td>{utcText(match.observedAt)}</td>
                  <td>{match.kind}</td>
                  <td>{match.source}</td>
                  <td>{matchTitle(match)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={analysis.muted}>No stored record matched in this period.</p>
      )}
      {result.matches.length > SHOWN && (
        <p className={analysis.muted}>
          The first {SHOWN} of {result.matches.length} are listed.
        </p>
      )}
      {evaluations.length > 0 && (
        <div className={analysis.tableWrap}>
          <table className={analysis.table}>
            <caption className={analysis.visuallyHidden}>Window evaluations</caption>
            <thead>
              <tr>
                <th scope="col">At</th>
                <th scope="col">Group</th>
                <th scope="col">Value</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.slice(-SHOWN).map((evaluation) => (
                <tr key={`${evaluation.at}-${evaluation.groupKey}`}>
                  <td>{utcText(evaluation.at)}</td>
                  <td>{evaluation.groupKey}</td>
                  <td>{evaluation.value ?? '—'}</td>
                  <td title={evaluation.reason ?? undefined}>{evaluation.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
