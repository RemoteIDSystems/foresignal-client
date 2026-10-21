import { X } from 'lucide-react';
import type { ForesignalClient } from '../api/client';
import { utcText } from '../intel/analysisView';
import { IconButton } from '../ui/Button';
import { AlertActions } from './AlertActions';
import type { AlertFeed } from './AlertFeed';
import { alertRef, alertTitle } from './alertView';
import { useAlertFeed } from './useAlerts';
import styles from './Alerts.module.css';

/** Props for {@link AlertToasts}. */
export interface AlertToastsProps {
  api: ForesignalClient | undefined;
  feed: AlertFeed;
  canAct: boolean;
  /** Opens an object by ref. */
  onOpen: (ref: string) => void;
}

/**
 * Toasts for the alerts that fire while the page is open, severity-colored, newest on top, at
 * most three. Each names its rule, message and time; clicking it opens the alert's object, and
 * its inline actions change it. A toast stays until dismissed or the alert stops firing.
 */
export function AlertToasts({ api, feed, canAct, onOpen }: AlertToastsProps) {
  const { toasts } = useAlertFeed(feed);
  if (toasts.length === 0) return null;
  return (
    <ul className={styles.toasts} aria-label="Alert notifications">
      {toasts.map((alert) => (
        <li
          key={alert.id}
          className={`${styles.toast} ${styles[alert.severity]}`}
          role="alert"
          data-severity={alert.severity}
          data-testid="alert-toast"
        >
          <div className={styles.toastHead}>
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
            <IconButton
              label="Dismiss alert"
              icon={<X size={14} />}
              onClick={() => feed.dismiss(alert.id)}
            />
          </div>
          <AlertActions
            api={api}
            alert={alert}
            canAct={canAct}
            onChanged={(changed) => feed.apply(changed)}
          />
        </li>
      ))}
    </ul>
  );
}
