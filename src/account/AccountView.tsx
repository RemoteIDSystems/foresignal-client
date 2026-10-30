import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { useMe } from '../api/useMe';
import { AccessNotice } from '../auth/AccessNotice';
import { signOut } from '../auth/auth';
import { useCan } from '../auth/permissions';
import type { Session } from '../app/session';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  THEME_CHOICES,
  updateMyPreferences,
  type NotificationDefaults,
  type ThemeChoice,
  type UserPreferences,
} from './preferences';
import {
  listMyNotificationPreferences,
  NOTIFICATION_EVENT_TYPES,
  replaceMyNotificationPreferences,
  toInput,
  type NotificationEventType,
  type NotificationPreference,
} from './notificationPreferences';
import styles from './AccountView.module.css';

/** How each theme choice reads in the editor. */
const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Match the system',
  light: 'Light',
  dark: 'Dark',
};

/** The IANA zones the timezone select offers: the browser's own first, then the full known set. */
function zoneOptions(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const all = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : [];
  const rest = all.filter((zone) => zone !== browser);
  return all.length ? [browser, ...rest] : [browser, 'UTC'];
}

/** A short human summary of a preference's quiet-hours window, if any. */
function quietHoursText(pref: NotificationPreference): string | null {
  const q = pref.quietHours;
  if (!q) return null;
  const days = q.days?.length ? ` · ${q.days.join(', ')}` : '';
  return `${q.start}–${q.end}${days}`;
}

/**
 * The Account screen (R2-007): the signed-in user's profile from `getMe`, and — for a user holding
 * `self.preferences` — editors for their preferences (theme, timezone, locale, notification
 * defaults) and their notification routing. Saving the preferences updates the app's theme and
 * clock everywhere through the session's preferences store.
 */
export function AccountView({ session }: { session: Session }) {
  const me = useMe();
  const can = useCan();

  if (!me) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Account</h1>
          <p className={styles.muted}>
            You are browsing anonymously. <Link to="/signin">Sign in</Link> to see your account and
            preferences.
          </p>
        </section>
      </div>
    );
  }

  const roles = me.user?.roles ?? [];
  return (
    <div className={styles.page}>
      <section className={styles.card} aria-label="Profile">
        <div className={styles.head}>
          <h1 className={styles.title}>Account</h1>
          <div className={styles.actions}>
            <Link to="/account/security">Sessions &amp; API tokens</Link>
            <Button type="button" onClick={() => void signOut(session)}>
              Sign out
            </Button>
          </div>
        </div>
        <dl className={styles.profile}>
          <dt>Email</dt>
          <dd data-testid="account-email">{me.user?.email ?? me.principal.displayName}</dd>
          {me.user?.fullName && (
            <>
              <dt>Name</dt>
              <dd>{me.user.fullName}</dd>
            </>
          )}
          <dt>Roles</dt>
          <dd>
            {roles.length ? (
              <span className={styles.roles}>
                {roles.map((role) => (
                  <Badge key={role.id} tone="info">
                    {role.name}
                  </Badge>
                ))}
              </span>
            ) : (
              <span className={styles.muted}>None assigned</span>
            )}
          </dd>
        </dl>
      </section>

      {can('self.preferences') ? (
        <>
          <PreferencesEditor session={session} />
          <NotificationRoutingEditor session={session} />
        </>
      ) : (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Preferences</h2>
          <p className={styles.muted}>Your role does not include managing your own preferences.</p>
        </section>
      )}
    </div>
  );
}

/** The preferences editor: theme, timezone, locale and notification defaults. */
function PreferencesEditor({ session }: { session: Session }) {
  const stored = useSyncExternalStore(session.preferences.subscribe, session.preferences.get);
  // Local edits overlay the stored preferences; `null` means "unedited, show the stored values".
  const [edited, setEdited] = useState<UserPreferences | null>(null);
  const [status, setStatus] = useState<
    { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; error: unknown }
  >({ kind: 'idle' });
  const zones = useMemo(() => zoneOptions(), []);

  // Load the preferences if the session did not already (e.g. direct navigation to this screen).
  useEffect(() => {
    if (!stored) void session.preferences.load(session.api);
  }, [stored, session]);

  const draft = edited ?? stored;
  if (!draft) {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Preferences</h2>
        <p className={styles.muted}>Loading your preferences…</p>
      </section>
    );
  }

  // The free-form `ui` object is preserved verbatim across the round-trip; this client defines no
  // keys in it yet. Every other field is edited below.
  const patch = (next: Partial<UserPreferences>) => {
    setEdited({ ...draft, ...next });
    setStatus({ kind: 'idle' });
  };
  const notifications: NotificationDefaults = draft.notifications ?? {
    emailEnabled: true,
    pushEnabled: true,
  };
  const patchNotifications = (next: Partial<NotificationDefaults>) =>
    patch({ notifications: { ...notifications, ...next } });

  const theme: ThemeChoice =
    draft.theme === 'light' || draft.theme === 'dark' ? draft.theme : 'system';

  const save = async () => {
    setStatus({ kind: 'saving' });
    try {
      const result = await updateMyPreferences(session.api, draft);
      session.preferences.set(result);
      setEdited(null);
      setStatus({ kind: 'saved' });
    } catch (error) {
      setStatus({ kind: 'error', error });
    }
  };

  return (
    <section className={styles.card} aria-label="Preferences">
      <h2 className={styles.cardTitle}>Preferences</h2>

      <fieldset className={styles.field}>
        <legend>Theme</legend>
        <div className={styles.radios}>
          {THEME_CHOICES.map((choice) => (
            <label key={choice} className={styles.radio}>
              <input
                type="radio"
                name="theme"
                checked={theme === choice}
                onChange={() => patch({ theme: choice })}
              />
              {THEME_LABELS[choice]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className={styles.field}>
        <span>Timezone</span>
        <select
          value={draft.timezone ?? ''}
          onChange={(event) => patch({ timezone: event.target.value || null })}
        >
          <option value="">Server default (UTC)</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Locale</span>
        <input
          type="text"
          placeholder="e.g. en-US"
          value={draft.locale ?? ''}
          onChange={(event) => patch({ locale: event.target.value.trim() || null })}
        />
      </label>

      <fieldset className={styles.field}>
        <legend>Notification defaults</legend>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={notifications.emailEnabled}
            onChange={(event) => patchNotifications({ emailEnabled: event.target.checked })}
          />
          Email notifications
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={notifications.pushEnabled}
            onChange={(event) => patchNotifications({ pushEnabled: event.target.checked })}
          />
          Push notifications
        </label>
        <label className={styles.subField}>
          <span>Quiet hours</span>
          <input
            type="text"
            placeholder="e.g. 22:00-07:00"
            value={notifications.quietHours ?? ''}
            onChange={(event) =>
              patchNotifications({ quietHours: event.target.value.trim() || null })
            }
          />
        </label>
      </fieldset>

      <div className={styles.actions}>
        <Button type="button" variant="primary" disabled={status.kind === 'saving'} onClick={save}>
          {status.kind === 'saving' ? 'Saving…' : 'Save preferences'}
        </Button>
        {status.kind === 'saved' && (
          <span className={styles.ok} role="status">
            Saved. Theme and timezone are applied across the app.
          </span>
        )}
      </div>
      {status.kind === 'error' && <AccessNotice error={status.error} />}
    </section>
  );
}

/**
 * The notification-routing editor: the principal's own `NotificationPreference` rows
 * (`listMyNotificationPreferences`/`replaceMyNotificationPreferences`). Existing rows can be
 * enabled or disabled, have their event types changed, their quiet hours cleared, or be removed;
 * saving replaces the whole set. Adding a fresh channel (which needs the channel type's own
 * secret configuration) is an owner question in the completion report.
 */
function NotificationRoutingEditor({ session }: { session: Session }) {
  const [loaded, setLoaded] = useState<NotificationPreference[] | null>(null);
  const [draft, setDraft] = useState<NotificationPreference[] | null>(null);
  const [status, setStatus] = useState<
    { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; error: unknown }
  >({ kind: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    listMyNotificationPreferences(session.api, controller.signal).then(
      (items) => {
        if (controller.signal.aborted) return;
        setLoaded(items);
        setDraft(items);
      },
      () => {
        if (!controller.signal.aborted) setLoaded([]);
      },
    );
    return () => controller.abort();
  }, [session]);

  if (!draft) {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Notification routing</h2>
        <p className={styles.muted}>Loading your notification routing…</p>
      </section>
    );
  }

  const update = (index: number, next: Partial<NotificationPreference>) => {
    setDraft(draft.map((pref, i) => (i === index ? { ...pref, ...next } : pref)));
    setStatus({ kind: 'idle' });
  };
  const toggleEvent = (index: number, event: NotificationEventType) => {
    const pref = draft[index];
    if (!pref) return;
    const has = pref.eventTypes.includes(event);
    const next = has
      ? pref.eventTypes.filter((type) => type !== event)
      : [...pref.eventTypes, event];
    // The contract requires at least one event type; keep the last one.
    if (next.length) update(index, { eventTypes: next });
  };
  const remove = (index: number) => {
    setDraft(draft.filter((_, i) => i !== index));
    setStatus({ kind: 'idle' });
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(loaded);
  const save = async () => {
    setStatus({ kind: 'saving' });
    try {
      const result = await replaceMyNotificationPreferences(session.api, draft.map(toInput));
      setLoaded(result);
      setDraft(result);
      setStatus({ kind: 'saved' });
    } catch (error) {
      setStatus({ kind: 'error', error });
    }
  };

  return (
    <section className={styles.card} aria-label="Notification routing">
      <h2 className={styles.cardTitle}>Notification routing</h2>
      {draft.length === 0 ? (
        <p className={styles.muted}>No notification routing is set up.</p>
      ) : (
        <ul className={styles.routes}>
          {draft.map((pref, index) => {
            const quiet = quietHoursText(pref);
            return (
              <li key={pref.id} className={styles.route}>
                <div className={styles.routeHead}>
                  <Badge tone="teal">{pref.channel.type}</Badge>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={pref.enabled}
                      onChange={(event) => update(index, { enabled: event.target.checked })}
                    />
                    Enabled
                  </label>
                  <Button type="button" variant="ghost" onClick={() => remove(index)}>
                    Remove
                  </Button>
                </div>
                <div className={styles.events}>
                  {NOTIFICATION_EVENT_TYPES.map((event) => (
                    <label key={event} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={pref.eventTypes.includes(event)}
                        onChange={() => toggleEvent(index, event)}
                      />
                      {event}
                    </label>
                  ))}
                </div>
                {quiet && (
                  <div className={styles.quiet}>
                    <span className={styles.muted}>Quiet hours: {quiet}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => update(index, { quietHours: null })}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          disabled={!dirty || status.kind === 'saving'}
          onClick={save}
        >
          {status.kind === 'saving' ? 'Saving…' : 'Save routing'}
        </Button>
        {status.kind === 'saved' && (
          <span className={styles.ok} role="status">
            Notification routing saved.
          </span>
        )}
      </div>
      {status.kind === 'error' && <AccessNotice error={status.error} />}
    </section>
  );
}
