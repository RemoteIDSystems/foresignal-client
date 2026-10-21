import { useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { SEVERITY_TONE } from '../alerts/alertView';
import { utcText } from '../intel/analysisView';
import type { Part } from '../intel/useEvidence';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import analysis from '../views/analysis/Analysis.module.css';
import { RuleDetail } from './RuleDetail';
import { stillUntil, storedInput } from './ruleDraft';
import { MUTE_FOR, RULE_SNOOZE_FOR, ruleStatus, windowText } from './ruleView';
import {
  deleteTrigger,
  muteTrigger,
  snoozeTrigger,
  unmuteTrigger,
  unsnoozeTrigger,
  updateTrigger,
  type Channel,
  type TriggerRule,
} from './triggerApi';
import styles from './Rules.module.css';

/** Props for {@link RulesList}. */
export interface RulesListProps {
  api: ForesignalClient | undefined;
  rules: Part<TriggerRule[]>;
  channels: Part<Channel[]>;
  /** Whether the token may change rules (`agent` scope). */
  canWrite: boolean;
  /** Opens a rule in the form. */
  onEdit: (rule: TriggerRule) => void;
  /** Called after any change, to read the rules again. */
  onChanged: () => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One rule: its name, type, severity, counts and state, its actions, and its detail. */
function RuleRow({
  api,
  rule,
  channels,
  canWrite,
  onEdit,
  onChanged,
}: Omit<RulesListProps, 'rules'> & { rule: TriggerRule }) {
  const [now] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const muted = stillUntil(rule.mutedUntil, now);
  const snoozed = stillUntil(rule.snoozedUntil, now);
  const act = async (work: (client: ForesignalClient) => Promise<unknown>) => {
    if (!api) return;
    setBusy(true);
    setError(undefined);
    try {
      await work(api);
      onChanged();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <li className={styles.rule} aria-label={rule.name}>
      <div className={styles.ruleHead}>
        <span className={styles.ruleName}>{rule.name}</span>
        <Badge tone={SEVERITY_TONE[rule.severity]}>{rule.severity}</Badge>
        <Badge tone="info">{rule.type}</Badge>
        {ruleStatus(rule, now).map((word) => (
          <Badge key={word} tone={word === 'error' ? 'danger' : 'neutral'}>
            {word}
          </Badge>
        ))}
      </div>
      <p className={styles.ruleLine}>
        {rule.alertCount ?? 0} alerts, {rule.openAlertCount ?? 0} open
        {rule.suppressedCount ? `, ${rule.suppressedCount} suppressed` : ''}; last fired{' '}
        {utcText(rule.lastFiredAt)}
        {muted ? `; muted until ${utcText(rule.mutedUntil)}` : ''}
        {snoozed ? `; snoozed until ${utcText(rule.snoozedUntil)}` : ''}
        {rule.windowStatus ? `; ${windowText(rule.windowStatus)}` : ''}
      </p>
      {rule.lastError && (
        <p className={analysis.error}>
          {utcText(rule.lastErrorAt)}: {rule.lastError}
        </p>
      )}
      <div className={styles.buttons}>
        <Button type="button" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide detail' : 'Detail'}
        </Button>
        {canWrite && (
          <>
            <Button type="button" variant="ghost" onClick={() => onEdit(rule)} disabled={busy}>
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void act((client) =>
                  updateTrigger(client, rule.id, { ...storedInput(rule), enabled: !rule.enabled }),
                )
              }
            >
              {rule.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void act((client) =>
                  muted ? unmuteTrigger(client, rule.id) : muteTrigger(client, rule.id, MUTE_FOR),
                )
              }
            >
              {muted ? 'Unmute' : `Mute ${MUTE_FOR}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void act((client) =>
                  snoozed
                    ? unsnoozeTrigger(client, rule.id)
                    : snoozeTrigger(client, rule.id, RULE_SNOOZE_FOR),
                )
              }
            >
              {snoozed ? 'Unsnooze' : `Snooze ${RULE_SNOOZE_FOR}`}
            </Button>
            {confirming ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  disabled={busy}
                  onClick={() => void act((client) => deleteTrigger(client, rule.id))}
                >
                  Confirm delete
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )}
          </>
        )}
      </div>
      {error && (
        <p className={analysis.error} role="alert">
          {error}
        </p>
      )}
      {open && (
        <RuleDetail
          api={api}
          rule={rule}
          channels={channels}
          canWrite={canWrite}
          onChanged={onChanged}
        />
      )}
    </li>
  );
}

/**
 * The alert rules (030), newest first: each with its counts and state, and, for a token with the
 * agent scope, Edit, Enable or Disable, Mute or Unmute, Snooze or Unsnooze, and Delete (confirmed).
 * Detail shows the rule's window state, baseline, tuning suggestions and delivery.
 */
export function RulesList({ rules, ...rest }: RulesListProps) {
  if (rules.status === 'loading') return <p className={analysis.muted}>Loading rules…</p>;
  if (rules.status === 'error')
    return <p className={analysis.error}>The rules did not load: {rules.message}</p>;
  if (!rules.value.length)
    return <p className={analysis.muted}>No alert rules yet. Create one to be alerted.</p>;
  const ordered = [...rules.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <ul className={styles.list} aria-label="Alert rules">
      {ordered.map((rule) => (
        <RuleRow key={`${rule.id}-${rule.updatedAt}`} rule={rule} {...rest} />
      ))}
    </ul>
  );
}
