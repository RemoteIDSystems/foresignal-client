import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { utcText } from '../intel/analysisView';
import { Button } from '../ui/Button';
import type { InboxItem } from './alertApi';
import { alertRef, badgeText } from './alertView';
import type { InboxFeed } from './InboxFeed';
import { useInbox } from './useAlerts';
import styles from './Alerts.module.css';
import buttons from '../ui/Button.module.css';

/** Props for {@link NotificationBell}. */
export interface NotificationBellProps {
  feed: InboxFeed;
  /** Whether there is a token: the inbox needs one. */
  hasToken: boolean;
  /** Opens an object by ref. */
  onOpen: (ref: string) => void;
}

/**
 * The top bar's notifications bell with this device's unread badge (`getNotificationBadge`, kept
 * current by the inbox stream's `badge` events; red while a critical one is unread). It opens the
 * inbox: the newest notifications with their read state on this device, Mark all read, and each
 * item marking itself read and opening its alert's object. Reading never acknowledges an alert.
 */
export function NotificationBell({ feed, hasToken, onOpen }: NotificationBellProps) {
  const inbox = useInbox(feed);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const unread = inbox.badge?.unread ?? 0;
  const critical = (inbox.badge?.unreadCritical ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onDown = (event: MouseEvent) =>
      wrap.current && !wrap.current.contains(event.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const toggle = () => {
    if (!open) feed.load();
    setOpen(!open);
  };
  const select = (item: InboxItem) => {
    if (!item.read) void feed.markRead(item.id).catch(() => {});
    if (item.alertId != null) {
      setOpen(false);
      onOpen(alertRef(item.alertId));
    }
  };

  return (
    <div className={styles.bellWrap} ref={wrap}>
      <button
        type="button"
        className={[buttons.button, buttons.icon, buttons.iconGhost, styles.bell].join(' ')}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
        data-testid="notification-bell"
        data-unread={unread}
      >
        <Bell size={17} strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && (
          <span
            className={critical ? `${styles.count} ${styles.countCritical}` : styles.count}
            aria-hidden="true"
          >
            {badgeText(unread)}
          </span>
        )}
      </button>
      {open && (
        <div className={styles.inbox} role="dialog" aria-label="Notifications">
          <div className={styles.inboxHead}>
            <h2 className={styles.inboxTitle}>Notifications</h2>
            {hasToken && (
              <Button
                variant="ghost"
                disabled={unread === 0}
                onClick={() => void feed.markAllRead().catch(() => {})}
              >
                Mark all read
              </Button>
            )}
          </div>
          {!hasToken ? (
            <p className={styles.muted}>The inbox needs an access token. Add one in Settings.</p>
          ) : inbox.list === 'loading' || inbox.list === 'idle' ? (
            <p className={styles.muted}>Loading notifications…</p>
          ) : inbox.list === 'error' ? (
            <p className={styles.muted}>{inbox.error}</p>
          ) : inbox.items.length === 0 ? (
            <p className={styles.muted}>No notifications on this device.</p>
          ) : (
            <ul className={styles.inboxList} aria-label="Inbox">
              {inbox.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.inboxItem} ${styles[item.severity]}`}
                    data-read={item.read}
                    onClick={() => select(item)}
                  >
                    <span
                      className={item.read ? styles.readDot : styles.unread}
                      aria-label={item.read ? undefined : 'Unread'}
                    />
                    <span>
                      <span className={styles.title}>{item.title}</span>
                      {item.body && <span className={styles.message}>{firstLine(item.body)}</span>}
                      <span className={styles.meta}>
                        {[item.event, item.severity, item.alertState, utcText(item.createdAt)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** The first line of a Markdown body, as plain text: no leading marks, emphasis or code ticks. */
function firstLine(body: string): string {
  return (body.split('\n').find((line) => line.trim()) ?? '')
    .replace(/^[#>*\-\s]+/, '')
    .replace(/\*\*|__|`/g, '');
}
