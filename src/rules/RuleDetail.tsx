import { useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { useTheme } from '../app/theme';
import { utcText } from '../intel/analysisView';
import { useRead } from '../intel/useHypotheses';
import type { Part } from '../intel/useEvidence';
import { Button } from '../ui/Button';
import { EChart } from '../ui/charts/EChart';
import { slotMeansOption } from '../ui/charts/chartOptions';
import analysis from '../views/analysis/Analysis.module.css';
import { isWindowed } from './ruleDraft';
import { baselineSeries, channelsForRule } from './ruleView';
import {
  applySuggestion,
  getBaseline,
  getSuggestions,
  getWindowState,
  listTuningLog,
  rebuildBaseline,
  type Channel,
  type TriggerRule,
} from './triggerApi';
import styles from './Rules.module.css';

/** Props for {@link RuleDetail}. */
export interface RuleDetailProps {
  api: ForesignalClient | undefined;
  rule: TriggerRule;
  /** The delivery channels (admin only; an error otherwise). */
  channels: Part<Channel[]>;
  canWrite: boolean;
  /** Called after a change to the rule (an applied suggestion). */
  onChanged: () => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A part's loading or error line, or nothing when it is ready. */
function partNote<T>(part: Part<T>, what: string) {
  if (part.status === 'loading') return <p className={analysis.muted}>Loading {what}…</p>;
  if (part.status === 'error')
    return (
      <p className={analysis.muted}>
        {what}: {part.message}
      </p>
    );
  return null;
}

/** The anomaly baseline: the learned mean per slot of each group, and a rebuild. */
function Baseline({ api, rule, canWrite }: Omit<RuleDetailProps, 'channels' | 'onChanged'>) {
  const theme = useTheme();
  const [version, setVersion] = useState(0);
  const [note, setNote] = useState<string>();
  const baseline = useRead(
    api,
    rule.id,
    (client, id, signal) => getBaseline(client, id, signal),
    version,
  );
  const rebuild = async () => {
    if (!api) return;
    try {
      await rebuildBaseline(api, rule.id);
      setNote('Rebuild accepted.');
      setVersion((current) => current + 1);
    } catch (error) {
      setNote(`Not rebuilt: ${messageOf(error)}`);
    }
  };
  return (
    <section aria-label="Baseline">
      <h3>Baseline</h3>
      {partNote(baseline, 'Baseline')}
      {baseline.status === 'ready' && (
        <>
          <p className={analysis.muted}>
            {baseline.value.weeksAvailable} of {baseline.value.minWeeks ?? 8} weeks,{' '}
            {baseline.value.learning
              ? `learning until ${utcText(baseline.value.learningUntil)}`
              : 'learned'}
            {baseline.value.lowConfidence ? ', low confidence' : ''}; {baseline.value.bucket}{' '}
            buckets by {baseline.value.slotMode}.
          </p>
          {baseline.value.slots.length > 0 && (
            <EChart
              option={slotMeansOption(
                theme.tokens,
                baselineSeries(baseline.value),
                baseline.value.slotMode,
              )}
              height={160}
              label={`Learned mean per ${baseline.value.slotMode} slot`}
              testId="baseline-chart"
            />
          )}
        </>
      )}
      {canWrite && (
        <div className={styles.buttons}>
          <Button type="button" variant="ghost" onClick={() => void rebuild()}>
            Rebuild baseline
          </Button>
        </div>
      )}
      {note && <p className={analysis.muted}>{note}</p>}
    </section>
  );
}

/**
 * One rule's live detail (030): its window state per group (windowed rules), its baseline (anomaly
 * rules), its open tuning suggestions with Apply, the applied tuning changes, and the channels
 * configured to deliver it. All of it is the backend's; the client applies nothing itself.
 */
export function RuleDetail({ api, rule, channels, canWrite, onChanged }: RuleDetailProps) {
  const [version, setVersion] = useState(0);
  const [note, setNote] = useState<string>();
  const windowState = useRead(
    api,
    isWindowed(rule.type) ? rule.id : undefined,
    (client, id, signal) => getWindowState(client, id, signal),
  );
  const suggestions = useRead(
    api,
    rule.id,
    (client, id, signal) => getSuggestions(client, id, signal),
    version,
  );
  const log = useRead(
    api,
    rule.id,
    (client, id, signal) => listTuningLog(client, id, signal),
    version,
  );
  const apply = async (suggestionId: string) => {
    if (!api) return;
    try {
      await applySuggestion(api, rule.id, suggestionId);
      setNote('Suggestion applied.');
      setVersion((current) => current + 1);
      onChanged();
    } catch (error) {
      setNote(`Not applied: ${messageOf(error)}`);
    }
  };
  const delivering = channels.status === 'ready' ? channelsForRule(channels.value, rule) : [];
  return (
    <div className={styles.detail}>
      {isWindowed(rule.type) && (
        <section aria-label="Window state">
          <h3>Window state</h3>
          {partNote(windowState, 'Window state')}
          {windowState.status === 'ready' &&
            (windowState.value.groups.length ? (
              <div className={analysis.tableWrap}>
                <table className={analysis.table}>
                  <thead>
                    <tr>
                      <th scope="col">Group</th>
                      <th scope="col">State</th>
                      <th scope="col">Value</th>
                      <th scope="col">Since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {windowState.value.groups.map((group) => (
                      <tr key={group.groupKey}>
                        <td>{group.groupKey}</td>
                        <td title={group.reason ?? undefined}>{group.state}</td>
                        <td>
                          {group.lastValue ?? '—'}
                          {group.threshold !== null && group.threshold !== undefined
                            ? ` / ${group.threshold}`
                            : ''}
                        </td>
                        <td>{utcText(group.since)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={analysis.muted}>No group has been evaluated yet.</p>
            ))}
        </section>
      )}
      {rule.type === 'anomaly' && <Baseline api={api} rule={rule} canWrite={canWrite} />}
      <section aria-label="Tuning suggestions">
        <h3>Tuning suggestions</h3>
        {partNote(suggestions, 'Suggestions')}
        {suggestions.status === 'ready' &&
          (suggestions.value.suggestions.length ? (
            <ul className={styles.list}>
              {suggestions.value.suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <strong>{suggestion.kind}</strong>: {suggestion.rationale}
                  {suggestion.explanation && (
                    <span className={styles.ruleLine}> {suggestion.explanation}</span>
                  )}
                  {suggestion.expectedEffect?.wouldFire !== undefined && (
                    <span className={styles.ruleLine}>
                      {' '}
                      Would fire {suggestion.expectedEffect.wouldFire}.
                    </span>
                  )}
                  {canWrite && suggestion.status === 'OPEN' && (
                    <Button type="button" variant="ghost" onClick={() => void apply(suggestion.id)}>
                      Apply
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={analysis.muted}>No open suggestions.</p>
          ))}
        {note && <p className={analysis.muted}>{note}</p>}
      </section>
      <section aria-label="Tuning log">
        <h3>Tuning log</h3>
        {partNote(log, 'Tuning log')}
        {log.status === 'ready' &&
          (log.value.items.length ? (
            <ul className={styles.list}>
              {log.value.items.map((entry) => (
                <li key={entry.id} className={styles.ruleLine}>
                  {utcText(entry.appliedAt)} by {entry.appliedBy}
                  {entry.note ? `: ${entry.note}` : ''}
                  {entry.undoneAt ? ` (undone ${utcText(entry.undoneAt)})` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className={analysis.muted}>No tuning applied.</p>
          ))}
      </section>
      <section aria-label="Delivered by">
        <h3>Delivered by</h3>
        {partNote(channels, 'Channels')}
        {channels.status === 'ready' &&
          (delivering.length ? (
            <ul className={styles.list}>
              {delivering.map((channel) => (
                <li key={channel.id} className={styles.ruleLine}>
                  {channel.name} ({channel.type})
                  {channel.minSeverity ? `, ${channel.minSeverity} and above` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className={analysis.muted}>No enabled channel names this rule or all rules.</p>
          ))}
      </section>
    </div>
  );
}
