import { useSyncExternalStore } from 'react';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import analysis from '../views/analysis/Analysis.module.css';
import styles from '../rules/Rules.module.css';
import type { PushStatus, WebPush } from './webPush';

/** What each state says, and its badge tone. */
const STATES: Readonly<Record<PushStatus, { text: string; tone: BadgeTone }>> = {
  unsupported: { text: 'Not supported in this browser', tone: 'neutral' },
  off: { text: 'Off', tone: 'neutral' },
  subscribing: { text: 'Subscribing…', tone: 'info' },
  verifying: { text: 'Waiting for the verification push…', tone: 'info' },
  on: { text: 'On', tone: 'success' },
  denied: { text: 'Notifications blocked', tone: 'warning' },
  error: { text: 'Not set up', tone: 'danger' },
};

/**
 * The Web Push opt-in (030): a switch that turns this browser's alert notifications on (register,
 * subscribe, verify) or off (unsubscribe), with where it stands and why it failed.
 */
export function PushToggle({ push }: { push: WebPush }) {
  const snapshot = useSyncExternalStore(push.subscribe, push.get);
  const state = STATES[snapshot.status];
  const busy = snapshot.status === 'subscribing' || snapshot.status === 'verifying';
  const on = snapshot.status === 'on';
  return (
    <div className={styles.toggle}>
      <label className={styles.check}>
        <input
          type="checkbox"
          role="switch"
          checked={on || busy}
          disabled={busy || snapshot.status === 'unsupported'}
          onChange={(event) => void (event.target.checked ? push.enable() : push.disable())}
        />
        Browser notifications for alerts
      </label>
      <Badge tone={state.tone} uppercase={false}>
        {state.text}
      </Badge>
      {snapshot.status === 'error' && snapshot.subscriptionId && (
        <Button type="button" variant="ghost" onClick={() => void push.disable()}>
          Remove subscription
        </Button>
      )}
      {snapshot.error && <p className={analysis.error}>{snapshot.error}</p>}
      {snapshot.status === 'denied' && (
        <p className={analysis.muted}>
          Allow notifications for this site in the browser to use this.
        </p>
      )}
    </div>
  );
}
