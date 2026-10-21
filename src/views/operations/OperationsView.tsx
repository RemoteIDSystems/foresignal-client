import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import type { Session } from '../../app/session';
import { useAlertFeed } from '../../alerts/useAlerts';
import { alertRef, alertTitle, SEVERITY_TONE } from '../../alerts/alertView';
import { utcText } from '../../intel/analysisView';
import type { Part } from '../../intel/useEvidence';
import { useRead } from '../../intel/useHypotheses';
import { useOpenObject } from '../../intel/useOpenObject';
import {
  getSource,
  listAnalysisCycles,
  listBriefings,
  listChannelDeliveries,
  listChannels,
  listChronicles,
  listEscalationPolicies,
  listExports,
  listPushDevices,
  listRecentRuns,
  listSinkRows,
  listSourceHealth,
  listTriggers,
  type Channel,
  type SourceHealth,
} from '../../operations/opsApi';
import {
  CHRONICLE_TONE,
  DELIVERY_TONE,
  filterHealth,
  HEALTH_ORDER,
  HEALTH_TONE,
  healthCounts,
  JOB_TONE,
  lagText,
  OPS_REFRESH_MS,
  OPS_ROWS,
  progressText,
  RUN_TONE,
  SINK_TONE,
  sinkState,
  type HealthFilter,
} from '../../operations/opsView';
import { useTick } from '../../operations/useTick';
import { ruleStatus } from '../../rules/ruleView';
import { listSensors } from '../../satellites/satelliteApi';
import { stationsOf } from '../../rf/rfView';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import analysis from '../analysis/Analysis.module.css';
import styles from './Operations.module.css';

/** A panel whose read the backend allows only with a token, when none is set. */
const NO_TOKEN = { status: 'error', message: 'This needs an access token (Settings).' } as const;

/** Props for {@link OperationsView}. */
export interface OperationsViewProps {
  session: Session;
}

/**
 * The Operations console (033). There is no mock for it, so it is laid out in the dashboard's
 * language as three sections of status panels:
 *
 * - **Tasks:** the live alert queue (029's feed), export and pack jobs, and recent briefing runs;
 * - **Assets:** the source-health board, channels with their recent deliveries, sinks with lag and
 *   state, registered push devices, and ground stations and receivers;
 * - **Workflows:** alert rules (authored on the Alerts screen, 030), briefings, escalation policies,
 *   analysis cycles and chronicles.
 *
 * Every panel is read only: the backend runs them, and changes are made where each is owned. The
 * polled panels read again every {@link OPS_REFRESH_MS}; a panel the token may not read says what
 * the backend answered.
 */
export function OperationsView({ session }: OperationsViewProps) {
  const { api, store, tokens, alerts } = session;
  const token = useSyncExternalStore(tokens.subscribe, tokens.get);
  const tick = useTick(OPS_REFRESH_MS);
  const open = useOpenObject(api, store);
  const feed = useAlertFeed(alerts);
  // Every read is keyed by the token too, so signing in reads again. A read the backend allows
  // only with a token is not asked for without one, and says so instead.
  const keyed = (name: string) => `${name}#${token ?? ''}`;
  const tokenOnly = (name: string) => (token ? keyed(name) : undefined);
  const withToken = <T,>(part: Part<T>): Part<T> => (token ? part : NO_TOKEN);
  const exportsPart = withToken(
    useRead(
      api,
      tokenOnly('exports'),
      (client, _key, signal) => listExports(client, OPS_ROWS, signal),
      tick,
    ),
  );
  const runs = useRead(
    api,
    keyed('runs'),
    (client, _key, signal) => listRecentRuns(client, OPS_ROWS, signal),
    tick,
  );
  const health = useRead(
    api,
    keyed('health'),
    (client, _key, signal) => listSourceHealth(client, signal),
    tick,
  );
  const channels = withToken(
    useRead(
      api,
      tokenOnly('channels'),
      (client, _key, signal) => listChannels(client, signal),
      tick,
    ),
  );
  const sinks = withToken(
    useRead(api, tokenOnly('sinks'), (client, _key, signal) => listSinkRows(client, signal), tick),
  );
  const devices = withToken(
    useRead(
      api,
      tokenOnly('devices'),
      (client, _key, signal) => listPushDevices(client, signal),
      tick,
    ),
  );
  const [windowStart] = useState(() => new Date().toISOString());
  const sensors = useRead(api, keyed(`sensors@${windowStart}`), (client, key, signal) => {
    const from = key.slice(key.indexOf('@') + 1, key.indexOf('#'));
    const to = new Date(Date.parse(from) + 6 * 3_600_000).toISOString();
    return listSensors(client, [-180, -90, 180, 90], from, to, ['station', 'receiver'], signal);
  });
  const rules = useRead(
    api,
    keyed('rules'),
    (client, _key, signal) => listTriggers(client, signal),
    tick,
  );
  const briefings = useRead(
    api,
    keyed('briefings'),
    (client, _key, signal) => listBriefings(client, signal),
    tick,
  );
  const policies = withToken(
    useRead(
      api,
      tokenOnly('policies'),
      (client, _key, signal) => listEscalationPolicies(client, signal),
      tick,
    ),
  );
  const cycles = useRead(
    api,
    keyed('cycles'),
    (client, _key, signal) => listAnalysisCycles(client, signal),
    tick,
  );
  const chronicles = withToken(
    useRead(
      api,
      tokenOnly('chronicles'),
      (client, _key, signal) => listChronicles(client, signal),
      tick,
    ),
  );
  const [now] = useState(() => Date.now());

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Operations</h1>
        <p className={analysis.muted}>
          Read-only status of what the backend runs. Panels read again every {OPS_REFRESH_MS / 1000}{' '}
          s; the alert queue is live.
        </p>
      </header>
      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="ops-tasks" data-testid="ops-tasks">
          <h2 id="ops-tasks" className={styles.sectionTitle}>
            Tasks
          </h2>
          <Panel
            title="Alert Queue"
            count={feed.open.length}
            live={feed.stream}
            link={{ to: '/alerts', label: 'Alerts' }}
          >
            {feed.error && <p className={analysis.error}>{feed.error}</p>}
            {feed.open.length === 0 ? (
              <p className={analysis.muted}>No open alerts.</p>
            ) : (
              <Rows>
                {feed.open.slice(0, OPS_ROWS).map((alert) => (
                  <Row
                    key={alert.id}
                    title={alertTitle(alert)}
                    detail={`${alert.message} · ${utcText(alert.firedAt)}`}
                    chips={[
                      { text: alert.severity, tone: SEVERITY_TONE[alert.severity] },
                      {
                        text: alert.acknowledgedAt ? 'acknowledged' : 'firing',
                        tone: alert.acknowledgedAt ? 'neutral' : 'danger',
                      },
                    ]}
                    onOpen={() => void open(alertRef(alert.id))}
                  />
                ))}
              </Rows>
            )}
          </Panel>
          <Panel title="Exports & Packs" part={exportsPart} count={countOf(exportsPart)}>
            {ready(exportsPart, (jobs) =>
              jobs.length === 0 ? (
                <p className={analysis.muted}>No export, snapshot or pack jobs.</p>
              ) : (
                <Rows>
                  {jobs.map((job) => (
                    <Row
                      key={job.id}
                      title={`${job.kind} · ${job.format}`}
                      detail={`${progressText(job)} · created ${utcText(job.createdAt)}${job.error ? ` · ${job.error}` : ''}`}
                      chips={[{ text: job.status, tone: JOB_TONE[job.status] }]}
                    />
                  ))}
                </Rows>
              ),
            )}
          </Panel>
          <Panel title="Briefing Runs" part={runs} count={countOf(runs)}>
            {ready(runs, (items) =>
              items.length === 0 ? (
                <p className={analysis.muted}>No briefing runs.</p>
              ) : (
                <Rows>
                  {items.map((run) => (
                    <Row
                      key={run.id ?? `${run.briefingId}-${run.startedAt}`}
                      title={run.briefingName}
                      detail={`started ${utcText(run.startedAt)}${run.error ? ` · ${run.error}` : ''}`}
                      chips={[{ text: run.status, tone: RUN_TONE[run.status] }]}
                    />
                  ))}
                </Rows>
              ),
            )}
          </Panel>
        </section>

        <section className={styles.section} aria-labelledby="ops-assets" data-testid="ops-assets">
          <h2 id="ops-assets" className={styles.sectionTitle}>
            Assets
          </h2>
          <HealthBoard api={api} part={health} />
          <Panel title="Channels" part={channels} count={countOf(channels)}>
            {ready(channels, (items) =>
              items.length === 0 ? (
                <p className={analysis.muted}>No delivery channels.</p>
              ) : (
                <Rows>
                  {items.map((channel) => (
                    <ChannelRow key={channel.id} api={api} channel={channel} />
                  ))}
                </Rows>
              ),
            )}
          </Panel>
          <Panel title="Sinks" part={sinks} count={countOf(sinks)}>
            {ready(sinks, (items) =>
              items.length === 0 ? (
                <p className={analysis.muted}>No sinks.</p>
              ) : (
                <Rows>
                  {items.map(({ sink, status, error }) => {
                    const state = sinkState(sink, status);
                    return (
                      <Row
                        key={sink.id}
                        title={sink.name}
                        detail={
                          error ??
                          `${sink.type} · lag ${lagText(status)} · ${status?.delivered ?? 0} delivered, ${status?.dropped ?? 0} dropped${status?.lastDeliveredAt ? ` · last ${utcText(status.lastDeliveredAt)}` : ''}`
                        }
                        chips={[
                          ...(state ? [{ text: state, tone: SINK_TONE[state] }] : []),
                          ...(sink.enabled ? [] : [{ text: 'disabled', tone: 'neutral' as const }]),
                        ]}
                      />
                    );
                  })}
                </Rows>
              ),
            )}
          </Panel>
          <Panel title="Push Devices" part={devices} count={countOf(devices)}>
            {ready(devices, (items) =>
              items.length === 0 ? (
                <p className={analysis.muted}>No registered push devices.</p>
              ) : (
                <Rows>
                  {items.map((device) => (
                    <Row
                      key={device.id}
                      title={device.deviceName ?? device.name ?? `…${device.tokenSuffix}`}
                      detail={`${device.platform} · ${device.transport}${device.lastSuccessAt ? ` · last sent ${utcText(device.lastSuccessAt)}` : ''}`}
                      chips={[
                        {
                          text: device.status,
                          tone: device.status === 'active' ? 'success' : 'neutral',
                        },
                      ]}
                    />
                  ))}
                </Rows>
              ),
            )}
          </Panel>
          <Panel
            title="Ground Stations & Receivers"
            part={sensors}
            count={sensors.status === 'ready' ? stationsOf(sensors.value.items).length : undefined}
            link={{ to: '/rf-sensors', label: 'RF / Sensors' }}
          >
            {ready(sensors, (value) => {
              const stations = stationsOf(value.items);
              return stations.length === 0 ? (
                <p className={analysis.muted}>No ground stations or receivers.</p>
              ) : (
                <Rows>
                  {stations.map((sensor) => (
                    <Row
                      key={sensor.ref}
                      title={sensor.title}
                      detail={sensor.summary ?? ''}
                      chips={[{ text: sensor.sensorKind, tone: 'info' }]}
                      onOpen={() => void open(sensor.ref)}
                    />
                  ))}
                </Rows>
              );
            })}
          </Panel>
        </section>

        <section
          className={styles.section}
          aria-labelledby="ops-workflows"
          data-testid="ops-workflows"
        >
          <h2 id="ops-workflows" className={styles.sectionTitle}>
            Workflows
          </h2>
          <Panel
            title="Alert Rules"
            part={rules}
            count={countOf(rules)}
            link={{ to: '/alerts?tab=rules', label: 'Author rules' }}
          >
            {ready(rules, (items) =>
              items.length === 0 ? (
                <p className={analysis.muted}>No alert rules.</p>
              ) : (
                <Rows>
                  {items.map((rule) => {
                    const words = ruleStatus(rule, now);
                    return (
                      <Row
                        key={rule.id}
                        title={rule.name}
                        detail={`${rule.type ?? 'record'} · ${rule.alertCount ?? 0} alerts${rule.lastFiredAt ? ` · last fired ${utcText(rule.lastFiredAt)}` : ' · never fired'}`}
                        chips={[
                          { text: rule.severity, tone: SEVERITY_TONE[rule.severity] },
                          ...(words.length === 0
                            ? [{ text: 'enabled', tone: 'success' as const }]
                            : words.map((word) => ({
                                text: word,
                                tone: (word === 'error' ? 'danger' : 'neutral') as BadgeTone,
                              }))),
                        ]}
                      />
                    );
                  })}
                </Rows>
              ),
            )}
          </Panel>
          <Panel title="Briefings" part={briefings} count={countOf(briefings)}>
            {ready(briefings, (items) =>
              items.length === 0 ? (
                <p className={analysis.muted}>No scheduled briefings.</p>
              ) : (
                <Rows>
                  {items.map((briefing) => (
                    <Row
                      key={briefing.id}
                      title={briefing.name}
                      detail={`${briefing.schedule} ${briefing.timezone}${briefing.lastRunAt ? ` · last run ${utcText(briefing.lastRunAt)}` : ''}${briefing.nextRunAt ? ` · next ${utcText(briefing.nextRunAt)}` : ''}`}
                      chips={[
                        {
                          text: briefing.enabled ? 'enabled' : 'disabled',
                          tone: briefing.enabled ? 'success' : 'neutral',
                        },
                        ...(briefing.lastRunStatus
                          ? [{ text: briefing.lastRunStatus, tone: 'neutral' as const }]
                          : []),
                      ]}
                    />
                  ))}
                </Rows>
              ),
            )}
          </Panel>
          <Panel title="Escalation Policies" part={policies} count={countOf(policies)}>
            {ready(policies, (items) =>
              items.length === 0 ? (
                <p className={analysis.muted}>No escalation policies.</p>
              ) : (
                <Rows>
                  {items.map((policy) => (
                    <Row
                      key={policy.id}
                      title={policy.name}
                      detail={`${policy.steps.length} ${policy.steps.length === 1 ? 'step' : 'steps'} · ${policy.ruleCount ?? 0} rules`}
                      chips={[]}
                    />
                  ))}
                </Rows>
              ),
            )}
          </Panel>
          <Panel title="Analysis Cycles" part={cycles} count={countOf(cycles)}>
            {ready(cycles, (items) =>
              items.length === 0 ? (
                <p className={analysis.muted}>No analysis cycles.</p>
              ) : (
                <Rows>
                  {items.map((cycle) => (
                    <Row
                      key={cycle.id}
                      title={cycle.name}
                      detail={`${cycle.cadence} · ${cycle.schedule.cron} ${cycle.schedule.timezone}${cycle.nextRunAt ? ` · next ${utcText(cycle.nextRunAt)}` : ''}`}
                      chips={[
                        {
                          text: cycle.enabled ? 'enabled' : 'disabled',
                          tone: cycle.enabled ? 'success' : 'neutral',
                        },
                        ...(cycle.builtIn ? [{ text: 'built-in', tone: 'neutral' as const }] : []),
                      ]}
                    />
                  ))}
                </Rows>
              ),
            )}
          </Panel>
          <Panel title="Chronicles" part={chronicles} count={countOf(chronicles)}>
            {ready(chronicles, (items) =>
              items.length === 0 ? (
                <p className={analysis.muted}>No chronicles.</p>
              ) : (
                <Rows>
                  {items.map((chronicle) => (
                    <Row
                      key={chronicle.id}
                      title={chronicle.name}
                      detail={`${chronicle.displayId}${chronicle.startedAt ? ` · since ${utcText(chronicle.startedAt)}` : ''}${chronicle.capState && chronicle.capState !== 'ok' ? ` · cap ${chronicle.capState}` : ''}`}
                      chips={[{ text: chronicle.status, tone: CHRONICLE_TONE[chronicle.status] }]}
                      onOpen={() => void open(chronicle.ref)}
                    />
                  ))}
                </Rows>
              ),
            )}
          </Panel>
        </section>
      </div>
    </div>
  );
}

/** A list's length once it is in. */
function countOf<T>(part: Part<readonly T[]>): number | undefined {
  return part.status === 'ready' ? part.value.length : undefined;
}

/** Renders a read's value once it is in; the panel shows loading and errors itself. */
function ready<T>(part: Part<T>, render: (value: T) => ReactNode): ReactNode {
  return part.status === 'ready' ? render(part.value) : null;
}

/** One status panel: a title with its count, an optional link, loading and error, and rows. */
function Panel({
  title,
  count,
  part,
  live,
  link,
  children,
}: {
  title: string;
  count?: number;
  part?: Part<unknown>;
  live?: string;
  link?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className={styles.panel} aria-label={title} data-state={part?.status ?? 'ready'}>
      <div className={styles.panelHead}>
        <h3 className={analysis.cardTitle}>
          {title}
          {count !== undefined ? ` (${count})` : ''}
        </h3>
        {live && (
          <Badge tone={live === 'open' ? 'success' : 'neutral'} uppercase={false}>
            {live === 'open' ? 'live' : live}
          </Badge>
        )}
        {link && (
          <Link className={analysis.linkButton} to={link.to}>
            {link.label} →
          </Link>
        )}
      </div>
      {part?.status === 'loading' && <p className={analysis.muted}>Loading…</p>}
      {part?.status === 'error' && <p className={analysis.error}>{part.message}</p>}
      {children}
    </section>
  );
}

/** The rows of a panel. */
function Rows({ children }: { children: ReactNode }) {
  return <ul className={styles.rows}>{children}</ul>;
}

/** One status row: a title (a button when it opens an object), a detail line and chips. */
function Row({
  title,
  detail,
  chips,
  onOpen,
  children,
}: {
  title: string;
  detail: string;
  chips: readonly { text: string; tone: BadgeTone }[];
  onOpen?: () => void;
  children?: ReactNode;
}) {
  return (
    <li className={styles.row} aria-label={title}>
      <div className={styles.rowHead}>
        {onOpen ? (
          <button type="button" className={analysis.linkButton} onClick={onOpen}>
            {title}
          </button>
        ) : (
          <span className={styles.rowTitle}>{title}</span>
        )}
        <span className={styles.chips}>
          {chips.map((chip) => (
            <Badge key={chip.text} tone={chip.tone} uppercase={false}>
              {chip.text}
            </Badge>
          ))}
        </span>
      </div>
      {detail && <p className={styles.rowDetail}>{detail}</p>}
      {children}
    </li>
  );
}

/** The source-health board: counts by status, a status filter, and the sources, worst first. */
function HealthBoard({
  api,
  part,
}: {
  api: ForesignalClient | undefined;
  part: Part<SourceHealth[]>;
}) {
  const [filter, setFilter] = useState<HealthFilter>('enabled');
  const [openSource, setOpenSource] = useState<string>();
  const rows = part.status === 'ready' ? filterHealth(part.value, filter) : [];
  const counts = part.status === 'ready' ? healthCounts(part.value) : undefined;
  return (
    <Panel
      title="Source Health"
      part={part}
      count={part.status === 'ready' ? part.value.length : undefined}
    >
      {counts && (
        <div className={styles.chips} data-testid="health-counts">
          {HEALTH_ORDER.map((status) => (
            <Badge key={status} tone={HEALTH_TONE[status]} uppercase={false}>
              {counts[status]} {status}
            </Badge>
          ))}
        </div>
      )}
      {part.status === 'ready' && (
        <select
          className={analysis.select}
          aria-label="Show sources"
          value={filter}
          onChange={(event) => setFilter(event.target.value as HealthFilter)}
        >
          <option value="enabled">Every enabled source</option>
          <option value="all">Every source</option>
          {HEALTH_ORDER.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      )}
      {part.status === 'ready' &&
        (rows.length === 0 ? (
          <p className={analysis.muted}>No sources with this status.</p>
        ) : (
          <Rows>
            {rows.map((entry) => (
              <Row
                key={entry.sourceId}
                title={entry.sourceId}
                detail={[
                  entry.statusReason,
                  entry.lastSuccessAt ? `last success ${utcText(entry.lastSuccessAt)}` : undefined,
                  entry.consecutiveFailures > 0
                    ? `${entry.consecutiveFailures} failures in a row`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                chips={[{ text: entry.status, tone: HEALTH_TONE[entry.status] }]}
                onOpen={() =>
                  setOpenSource((current) =>
                    current === entry.sourceId ? undefined : entry.sourceId,
                  )
                }
              >
                {openSource === entry.sourceId && (
                  <SourceFacts api={api} sourceId={entry.sourceId} />
                )}
              </Row>
            ))}
          </Rows>
        ))}
    </Panel>
  );
}

/** A source's descriptor and its last error (`getSource`), under its health row. */
function SourceFacts({ api, sourceId }: { api: ForesignalClient | undefined; sourceId: string }) {
  const detail = useRead(api, sourceId, (client, key, signal) => getSource(client, key, signal));
  if (detail.status === 'loading') return <p className={analysis.muted}>Loading the source…</p>;
  if (detail.status === 'error') return <p className={analysis.error}>{detail.message}</p>;
  const { descriptor, health } = detail.value;
  const facts: [string, string | undefined][] = [
    ['Name', descriptor.name],
    ['Kinds', descriptor.kinds?.join(', ')],
    ['Last attempt', health.lastAttemptAt ? utcText(health.lastAttemptAt) : undefined],
    ['Last error', health.lastError ?? undefined],
    ['Requests last hour', health.requestsLastHour?.toLocaleString('en-US')],
  ];
  return (
    <dl className={analysis.facts} data-testid="source-facts">
      {facts
        .filter((fact): fact is [string, string] => Boolean(fact[1]))
        .map(([label, value]) => (
          <div key={label} className={styles.fact}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}

/** A channel's row, with its recent deliveries (`listChannelDeliveries`) on request. */
function ChannelRow({ api, channel }: { api: ForesignalClient | undefined; channel: Channel }) {
  const [shown, setShown] = useState(false);
  return (
    <Row
      title={channel.name}
      detail={`${channel.type}${channel.lastDeliveryAt ? ` · last delivery ${utcText(channel.lastDeliveryAt)}` : ''}${channel.failedLast24h ? ` · ${channel.failedLast24h} failed in 24 h` : ''}`}
      chips={[
        {
          text: channel.enabled ? 'enabled' : 'disabled',
          tone: channel.enabled ? 'success' : 'neutral',
        },
      ]}
    >
      <Button variant="ghost" onClick={() => setShown((current) => !current)}>
        {shown ? 'Hide deliveries' : 'Recent deliveries'}
      </Button>
      {shown && <Deliveries api={api} channelId={channel.id} />}
    </Row>
  );
}

/** A channel's ten newest deliveries. */
function Deliveries({ api, channelId }: { api: ForesignalClient | undefined; channelId: string }) {
  const part = useRead(api, channelId, (client, key, signal) =>
    listChannelDeliveries(client, key, 10, signal),
  );
  if (part.status === 'loading') return <p className={analysis.muted}>Loading deliveries…</p>;
  if (part.status === 'error') return <p className={analysis.error}>{part.message}</p>;
  if (part.value.length === 0) return <p className={analysis.muted}>No deliveries yet.</p>;
  return (
    <ul className={styles.deliveries} aria-label="Recent deliveries">
      {part.value.map((delivery) => (
        <li key={delivery.id}>
          <Badge tone={DELIVERY_TONE[delivery.status]} uppercase={false}>
            {delivery.status}
          </Badge>{' '}
          {delivery.event}
          {delivery.deliveredAt ? ` · ${utcText(delivery.deliveredAt)}` : ''}
          {delivery.lastError ? ` · ${delivery.lastError}` : ''}
        </li>
      ))}
    </ul>
  );
}
