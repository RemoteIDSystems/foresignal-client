import { useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { Button } from '../ui/Button';
import {
  acknowledgeAlert,
  resolveAlert,
  setAlertFeedback,
  snoozeAlert,
  unsnoozeAlert,
  type Alert,
  type AlertFeedback,
} from './alertApi';
import { alertActions, alertTitle, FEEDBACK_OPTIONS, SNOOZE_FOR } from './alertView';
import styles from './Alerts.module.css';

/** Props for {@link AlertActions}. */
export interface AlertActionsProps {
  api: ForesignalClient | undefined;
  alert: Alert;
  /** Whether the token may change alerts. */
  canAct: boolean;
  /** Called with the alert a lifecycle call answered. */
  onChanged: (alert: Alert) => void;
}

/**
 * An alert's inline lifecycle actions, as the token allows: Ack (`acknowledgeAlert`), Snooze for
 * {@link SNOOZE_FOR} (`snoozeAlert`) or Unsnooze (`unsnoozeAlert`), Resolve (`resolveAlert`), and
 * feedback (`setAlertFeedback`). Nothing renders when none is allowed. A failed call says why.
 */
export function AlertActions({ api, alert, canAct, onChanged }: AlertActionsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // When the actions were first drawn: a snooze running out later shows on the next draw.
  const [now] = useState(() => Date.now());
  const allowed = alertActions(alert, canAct, now);
  if (!api || !(allowed.ack || allowed.snooze || allowed.unsnooze || allowed.resolve)) {
    return null;
  }
  const run = (call: (client: ForesignalClient) => Promise<Alert>) => {
    setBusy(true);
    setError(undefined);
    call(api).then(
      (changed) => {
        setBusy(false);
        onChanged(changed);
      },
      (cause: unknown) => {
        setBusy(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };
  const title = alertTitle(alert);
  return (
    <div className={styles.actions} role="group" aria-label={`Actions for ${title}`}>
      {allowed.ack && (
        <Button disabled={busy} onClick={() => run((client) => acknowledgeAlert(client, alert.id))}>
          Ack
        </Button>
      )}
      {allowed.snooze && (
        <Button
          disabled={busy}
          title={`Silence new matches of this rule and entity for ${SNOOZE_FOR}`}
          onClick={() => run((client) => snoozeAlert(client, alert.id, SNOOZE_FOR))}
        >
          Snooze {SNOOZE_FOR}
        </Button>
      )}
      {allowed.unsnooze && (
        <Button disabled={busy} onClick={() => run((client) => unsnoozeAlert(client, alert.id))}>
          Unsnooze
        </Button>
      )}
      {allowed.resolve && (
        <Button disabled={busy} onClick={() => run((client) => resolveAlert(client, alert.id))}>
          Resolve
        </Button>
      )}
      {allowed.feedback && (
        <select
          className={styles.feedback}
          aria-label="Feedback"
          value={alert.feedback ?? ''}
          disabled={busy}
          onChange={(event) =>
            event.target.value &&
            run((client) => setAlertFeedback(client, alert.id, event.target.value as AlertFeedback))
          }
        >
          <option value="">Feedback…</option>
          {FEEDBACK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {error && <span className={styles.actionError}>{error}</span>}
    </div>
  );
}
