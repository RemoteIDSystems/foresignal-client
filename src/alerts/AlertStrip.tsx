import { useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { utcText } from '../intel/analysisView';
import { AlertActions } from './AlertActions';
import type { AlertFeed } from './AlertFeed';
import { alertRef, alertTitle, mostPressing } from './alertView';
import { useAlertFeed } from './useAlerts';
import styles from './Alerts.module.css';

/** Props for {@link AlertStrip}. */
export interface AlertStripProps {
  api: ForesignalClient | undefined;
  feed: AlertFeed;
  canAct: boolean;
  /** Opens an object by ref. */
  onOpen: (ref: string) => void;
}

/**
 * The top alerts strip, under the navigation while any alert is open: how many are firing and
 * acknowledged, the most pressing one (firing first, then by severity, then newest) with its
 * actions, and Show all to list every open alert with its own. Hidden when none is open.
 */
export function AlertStrip({ api, feed, canAct, onOpen }: AlertStripProps) {
  const { open } = useAlertFeed(feed);
  const [expanded, setExpanded] = useState(false);
  const top = mostPressing(open);
  if (!top) return null;
  const firing = open.filter((alert) => alert.state === 'firing').length;
  return (
    <section
      className={`${styles.strip} ${styles[top.severity]}`}
      aria-label="Open alerts"
      data-testid="alert-strip"
      data-open={open.length}
    >
      <div className={styles.stripRow}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.stripCount}>
          {firing} firing{open.length > firing ? `, ${open.length - firing} acknowledged` : ''}
        </span>
        <button type="button" className={styles.open} onClick={() => onOpen(alertRef(top.id))}>
          <span className={styles.title}>
            {alertTitle(top)}: {top.message}
          </span>
        </button>
        <AlertActions
          api={api}
          alert={top}
          canAct={canAct}
          onChanged={(changed) => feed.apply(changed)}
        />
        {open.length > 1 && (
          <button
            type="button"
            className={styles.open}
            style={{ flex: 'none' }}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Hide' : `Show all ${open.length}`}
          </button>
        )}
      </div>
      {expanded && (
        <ul className={styles.stripList} aria-label="All open alerts">
          {open.map((alert) => (
            <li key={alert.id} className={`${styles.stripItem} ${styles[alert.severity]}`}>
              <button
                type="button"
                className={styles.open}
                onClick={() => onOpen(alertRef(alert.id))}
              >
                <span className={styles.title}>{alertTitle(alert)}</span>
                <span className={styles.message}>{alert.message}</span>
                <span className={styles.meta}>
                  {alert.severity} · {alert.state} · {utcText(alert.firedAt)}
                </span>
              </button>
              <AlertActions
                api={api}
                alert={alert}
                canAct={canAct}
                onChanged={(changed) => feed.apply(changed)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
