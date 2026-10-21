import { useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { AlertActions } from '../../alerts/AlertActions';
import { alertRef, alertTitle } from '../../alerts/alertView';
import { useAlertFeed, useCanActOnAlerts } from '../../alerts/useAlerts';
import alertStyles from '../../alerts/Alerts.module.css';
import type { Session } from '../../app/session';
import { utcText } from '../../intel/analysisView';
import { getSituation } from '../../intel/situationApi';
import { useRead } from '../../intel/useHypotheses';
import { useOpenObject } from '../../intel/useOpenObject';
import { PushToggle } from '../../push/PushToggle';
import { ChannelsPanel } from '../../rules/ChannelsPanel';
import {
  draftOf,
  newDraft,
  regionScope,
  viewportScope,
  watchlistScope,
  type RuleDraft,
} from '../../rules/ruleDraft';
import { RuleForm } from '../../rules/RuleForm';
import { RulesList } from '../../rules/RulesList';
import {
  listChannels,
  listChannelTypes,
  listKinds,
  listTriggers,
  listWatchlists,
  type TriggerRule,
} from '../../rules/triggerApi';
import { useStoreKey } from '../../state/store';
import { Button } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import analysis from '../analysis/Analysis.module.css';
import styles from '../imagery/ImageryView.module.css';

type AlertsTab = 'open' | 'rules' | 'delivery';

const TABS: readonly { key: AlertsTab; label: string }[] = [
  { key: 'open', label: 'Open Alerts' },
  { key: 'rules', label: 'Rules' },
  { key: 'delivery', label: 'Delivery' },
];

/** What a "Create alert" link asks the form to watch: `?new=view|situation|watchlist&ref=…`. */
type Prefill = { kind: 'view' } | { kind: 'situation' | 'watchlist'; ref: string } | undefined;

function prefillOf(params: URLSearchParams): Prefill {
  const kind = params.get('new');
  const ref = params.get('ref');
  if (kind === 'view') return { kind };
  if ((kind === 'situation' || kind === 'watchlist') && ref) return { kind, ref };
  if (kind !== null) return { kind: 'view' };
  return undefined;
}

/**
 * The Alerts screen (030): the open alerts with their actions (029); the alert rules, authored
 * here with a dry run before save and managed in place; and delivery: this browser's Web Push
 * opt-in and the delivery channels. A "Create alert" link from the map, a situation or a
 * watchlist opens the form with its scope filled in (`?new=view`, `?new=situation&ref=<id>`,
 * `?new=watchlist&ref=<id>`).
 */
export function AlertsView({ session }: { session: Session }) {
  const { api, store, alerts, push, tokens } = session;
  const [params, setParams] = useSearchParams();
  const prefill = prefillOf(params);
  const requested = params.get('tab') as AlertsTab | null;
  const tab: AlertsTab = prefill
    ? 'rules'
    : requested && TABS.some((item) => item.key === requested)
      ? requested
      : 'open';
  const token = useSyncExternalStore(tokens.subscribe, tokens.get);
  const canWrite = useCanActOnAlerts(api, token);
  const viewport = useStoreKey('viewport', store);
  const openObject = useOpenObject(api, store);
  const { open } = useAlertFeed(alerts);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<TriggerRule | 'new'>();

  const rules = useRead(
    api,
    'rules',
    (client, _key, signal) => listTriggers(client, signal),
    version,
  );
  const kinds = useRead(api, 'kinds', (client, _key, signal) => listKinds(client, signal));
  const watchlists = useRead(
    api,
    token ? `watchlists#${token}` : undefined,
    (client, _key, signal) => listWatchlists(client, signal),
  );
  const channels = useRead(api, token ? `channels#${token}` : undefined, (client, _key, signal) =>
    listChannels(client, signal),
  );
  const channelTypes = useRead(api, token ? `types#${token}` : undefined, (client, _key, signal) =>
    listChannelTypes(client, signal),
  );
  const situation = useRead(
    api,
    prefill?.kind === 'situation' ? prefill.ref : undefined,
    (client, id, signal) => getSituation(client, id, signal),
  );
  const noToken = { status: 'error', message: 'This needs an access token (Settings).' } as const;

  const setTab = (key: AlertsTab) => setParams(key === 'open' ? {} : { tab: key });
  const close = (saved: boolean) => {
    setEditing(undefined);
    setParams({ tab: 'rules' });
    if (saved) setVersion((current) => current + 1);
  };

  // The form's starting state, and a key that starts it again when that changes.
  let initial: { draft: RuleDraft; key: string; note?: string } | undefined;
  if (editing && editing !== 'new') {
    initial = { draft: draftOf(editing), key: `edit-${editing.id}-${editing.updatedAt}` };
  } else if (prefill?.kind === 'situation') {
    if (situation.status === 'ready') {
      const value = situation.value;
      initial = {
        draft: newDraft(regionScope(value.regionCodes, value.title), `${value.title} watch`),
        key: `situation-${prefill.ref}`,
      };
    } else if (situation.status === 'error') {
      initial = {
        draft: newDraft(),
        key: `situation-${prefill.ref}-error`,
        note: `The situation did not load (${situation.message}); the rule watches everywhere.`,
      };
    }
  } else if (prefill?.kind === 'watchlist') {
    if (watchlists.status === 'ready') {
      const list = watchlists.value.find((item) => item.id === prefill.ref);
      initial = {
        draft: newDraft(
          watchlistScope(prefill.ref, list?.name ?? prefill.ref),
          list ? `${list.name} watch` : '',
        ),
        key: `watchlist-${prefill.ref}`,
      };
    } else if (!token || watchlists.status === 'error') {
      initial = {
        draft: newDraft(watchlistScope(prefill.ref, prefill.ref)),
        key: `watchlist-${prefill.ref}-unnamed`,
      };
    }
  } else if (prefill?.kind === 'view' || editing === 'new') {
    initial = {
      draft: newDraft(
        prefill ? viewportScope(viewport) : undefined,
        prefill ? 'Map view watch' : '',
      ),
      key: prefill ? 'view' : 'new',
    };
  }
  const formOpen = !!editing || !!prefill;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Alerts</h1>
        <Tabs items={TABS} value={tab} onChange={setTab} label="Alerts views" />
      </div>

      {tab === 'open' && (
        <section className={styles.card} aria-label="Open alerts">
          {open.length ? (
            <ul className={alertStyles.stripList}>
              {open.map((alert) => (
                <li
                  key={alert.id}
                  className={`${alertStyles.stripItem} ${alertStyles[alert.severity]}`}
                >
                  <button
                    type="button"
                    className={alertStyles.open}
                    onClick={() => void openObject(alertRef(alert.id))}
                  >
                    <span className={alertStyles.title}>{alertTitle(alert)}</span>
                    <span className={alertStyles.message}>{alert.message}</span>
                    <span className={alertStyles.meta}>
                      {alert.severity} · {alert.state} · {utcText(alert.firedAt)}
                    </span>
                  </button>
                  <AlertActions
                    api={api}
                    alert={alert}
                    canAct={canWrite}
                    onChanged={(changed) => alerts.apply(changed)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className={analysis.muted}>No alert is firing or acknowledged.</p>
          )}
        </section>
      )}

      {tab === 'rules' && (
        <>
          {formOpen ? (
            <section className={styles.card} aria-label="Rule editor">
              <h2 className={analysis.cardTitle}>
                {editing && editing !== 'new' ? `Edit ${editing.name}` : 'New alert rule'}
              </h2>
              {initial?.note && <p className={analysis.muted}>{initial.note}</p>}
              {initial ? (
                <RuleForm
                  key={initial.key}
                  api={api}
                  initial={initial.draft}
                  base={editing && editing !== 'new' ? editing : undefined}
                  viewport={viewport}
                  watchlists={token ? watchlists : noToken}
                  kinds={kinds}
                  canWrite={canWrite}
                  onSaved={() => close(true)}
                  onCancel={() => close(false)}
                />
              ) : (
                <p className={analysis.muted}>Loading the scope…</p>
              )}
            </section>
          ) : (
            <div>
              <Button
                type="button"
                variant="primary"
                icon={<Plus size={14} />}
                onClick={() => setEditing('new')}
              >
                New rule
              </Button>
            </div>
          )}
          <section className={styles.card} aria-label="Rules">
            <h2 className={analysis.cardTitle}>Rules</h2>
            <RulesList
              api={api}
              rules={rules}
              channels={token ? channels : noToken}
              canWrite={canWrite}
              onEdit={(rule) => {
                setEditing(rule);
                setParams({ tab: 'rules' });
              }}
              onChanged={() => setVersion((current) => current + 1)}
            />
          </section>
        </>
      )}

      {tab === 'delivery' && (
        <>
          <section className={styles.card} aria-label="Web Push">
            <h2 className={analysis.cardTitle}>This browser</h2>
            <p className={analysis.muted}>
              Alerts arrive as notifications even with ForeSignal closed. Activating one opens the
              alert.
            </p>
            <PushToggle push={push} />
          </section>
          <section className={styles.card} aria-label="Channels">
            <h2 className={analysis.cardTitle}>Channels</h2>
            <ChannelsPanel
              api={api}
              channels={token ? channels : noToken}
              types={token ? channelTypes : noToken}
            />
          </section>
        </>
      )}
    </div>
  );
}
