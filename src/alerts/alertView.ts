import type { BadgeTone } from '../ui/Badge';
import type { Me } from '../annotations/annotationApi';
import type { Alert, AlertFeedback } from './alertApi';

/** The color of each severity, as toasts, the strip and the inbox draw it. */
export const SEVERITY_TONE: Readonly<Record<Alert['severity'], BadgeTone>> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
};

/** How long Snooze silences an alert: the backend's own default for a snooze action. */
export const SNOOZE_FOR = '1h';

/** The feedback the backend takes, with its labels. */
export const FEEDBACK_OPTIONS: readonly { value: AlertFeedback; label: string }[] = [
  { value: 'useful', label: 'Useful' },
  { value: 'noise', label: 'Noise' },
  { value: 'late', label: 'Late' },
  { value: 'false_positive', label: 'False positive' },
];

/** An alert's object ref (`alert:<id>`), which opens it as search results do. */
export function alertRef(id: number): string {
  return `alert:${id}`;
}

/** An alert's heading: its rule's name, else its kind. */
export function alertTitle(alert: Alert): string {
  return alert.ruleName ?? alert.kind ?? 'Alert';
}

/** Whether a token's scopes may change alerts: the lifecycle calls need `agent` (or `admin`). */
export function canActOnAlerts(me: Me | undefined): boolean {
  return (me?.scopes ?? []).some((scope) => scope === 'agent' || scope === 'admin');
}

/** Which lifecycle actions an alert offers. */
export interface AlertActionSet {
  ack: boolean;
  snooze: boolean;
  unsnooze: boolean;
  resolve: boolean;
  feedback: boolean;
}

/**
 * The actions an alert offers to a caller: Ack while firing; Snooze until resolved (Unsnooze
 * while a snooze runs); Resolve until resolved; feedback in any state. None without the scope.
 */
export function alertActions(alert: Alert, canAct: boolean, now: number): AlertActionSet {
  const open = alert.state !== 'resolved';
  const snoozed = !!alert.snoozedUntil && Date.parse(alert.snoozedUntil) > now;
  return {
    ack: canAct && alert.state === 'firing',
    snooze: canAct && open && !snoozed,
    unsnooze: canAct && open && snoozed,
    resolve: canAct && open,
    feedback: canAct,
  };
}

/** The most pressing open alert: firing before acknowledged, then by severity, then newest. */
export function mostPressing(alerts: readonly Alert[]): Alert | undefined {
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return [...alerts].sort(
    (a, b) =>
      Number(a.state !== 'firing') - Number(b.state !== 'firing') ||
      rank[a.severity] - rank[b.severity] ||
      Date.parse(b.firedAt) - Date.parse(a.firedAt),
  )[0];
}

/** A badge count as the bell shows it: up to 99, then `99+`. */
export function badgeText(unread: number): string {
  return unread > 99 ? '99+' : String(unread);
}
