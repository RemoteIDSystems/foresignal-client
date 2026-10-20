import { useEffect, useMemo, useState } from 'react';
import { FileText, Image, Radio, ScrollText, X, type LucideIcon } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { useTheme } from '../../app/theme';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { EChart } from '../../ui/charts/EChart';
import { timeSeriesOption, type ChartSeries } from '../../ui/charts/chartOptions';
import { Tabs } from '../../ui/Tabs';
import { envelopeAllows, itemRef, itemTitle, utcText } from '../../intel/analysisView';
import {
  dismissFinding,
  getSeriesData,
  type AnalyticFinding,
  type ImpactRate,
  type ProjectedImpact,
  type SeriesData,
} from '../../intel/analyticsApi';
import {
  EVIDENCE_GROUPS,
  findingRef,
  findingTone,
  itemEvidence,
  memberEvidence,
  metricTabs,
  percentText,
  rateFor,
  seriesName,
  seriesPoints,
  statTile,
  type EvidenceGroup,
  type EvidenceRow,
  type MetricTab,
} from '../../intel/findingsView';
import type { Analysis } from '../../intel/useAnalysis';
import { evidenceScope, useEvidence, type EvidenceState, type Part } from '../../intel/useEvidence';
import { prettifyId } from '../../lib/labels';
import { getObject } from '../../objects/objectApi';
import styles from './Analysis.module.css';

/** How many evidence rows show before "View all evidence". */
export const EVIDENCE_ROWS = 6;

/** The metrics window, in days, and the stat tiles' comparison window. */
const METRICS_DAYS = 90;
const TILE_DAYS = 30;

const GROUP_ICONS: Readonly<Record<EvidenceGroup, LucideIcon>> = {
  imagery: Image,
  signals: Radio,
  reports: ScrollText,
  docs: FileText,
};

/**
 * The Evidence tab for a loaded analysis: reads its findings, impacts, rates and series
 * ({@link useEvidence}) and lists its members or items as evidence.
 */
export function AnalysisEvidence({
  api,
  analysis,
  onOpen,
}: {
  api: ForesignalClient | undefined;
  analysis: Analysis;
  onOpen: (ref: string) => void;
}) {
  const scope = useMemo(() => evidenceScope(analysis), [analysis]);
  const evidence = useEvidence(api, scope);
  const rows = useMemo(
    () =>
      analysis.kind === 'situation'
        ? memberEvidence(analysis.members)
        : itemEvidence(analysis.investigation.items ?? [], itemRef, itemTitle),
    [analysis],
  );
  const preferred = analysis.kind === 'situation' ? analysis.situation.signalFamilies : undefined;
  const tabs = useMemo<Part<MetricTab[]>>(
    () =>
      evidence.series.status === 'ready'
        ? { status: 'ready', value: metricTabs(evidence.series.value, preferred ?? []) }
        : evidence.series,
    [evidence.series, preferred],
  );
  return <EvidenceTab api={api} evidence={evidence} rows={rows} tabs={tabs} onOpen={onOpen} />;
}

/**
 * The Evidence tab (020): the Metrics panel, the Evidence panel, the Analytic Findings and the
 * Projected Impacts with their base rates.
 */
export function EvidenceTab({
  api,
  evidence,
  rows,
  tabs,
  onOpen,
}: {
  api: ForesignalClient | undefined;
  evidence: EvidenceState;
  rows: readonly EvidenceRow[];
  tabs: Part<MetricTab[]>;
  onOpen: (ref: string) => void;
}) {
  return (
    <div className={styles.grid} data-testid="evidence-tab">
      <MetricsPanel api={api} tabs={tabs} />
      <EvidencePanel rows={rows} onOpen={onOpen} />
      <FindingsPanel api={api} findings={evidence.findings} onOpen={onOpen} />
      <ImpactsPanel impacts={evidence.impacts} rates={evidence.rates} />
    </div>
  );
}

/** A part's loading or failure line, or nothing once it is ready. */
function partNote(part: Part<unknown>, what: string) {
  if (part.status === 'loading') return <p className={styles.muted}>Loading {what}…</p>;
  if (part.status === 'error') return <p className={styles.error}>{part.message}</p>;
  return null;
}

/**
 * The Metrics panel, as the Conflict mock's CONFLICT METRICS: a tab per signal family; the open
 * tab's series (`getAnalyticsSeriesData`, the last 90 days) as a chart of 7-day averages, and a
 * stat tile per series with its latest 30 days' total and the change from the 30 days before.
 */
export function MetricsPanel({
  api,
  tabs,
}: {
  api: ForesignalClient | undefined;
  tabs: Part<MetricTab[]>;
}) {
  const theme = useTheme();
  const [chosen, setChosen] = useState<string>();
  const [now] = useState(() => Date.now());
  const list = tabs.status === 'ready' ? tabs.value : [];
  const tab = list.find((t) => t.family === chosen) ?? list[0];
  const [data, setData] = useState<{ family: string; value?: SeriesData[]; error?: string }>();
  // The open tab by its family and series, so a refreshed analysis does not read them again.
  const tabKey = tab ? JSON.stringify([tab.family, tab.series.map((one) => one.ref)]) : '';
  useEffect(() => {
    if (!api || !tabKey) return;
    const [family, refs] = JSON.parse(tabKey) as [string, string[]];
    const controller = new AbortController();
    const window = {
      from: new Date(now - METRICS_DAYS * 86_400_000).toISOString(),
      to: new Date(now).toISOString(),
    };
    Promise.all(refs.map((ref) => getSeriesData(api, ref, window, controller.signal))).then(
      (value) => !controller.signal.aborted && setData({ family, value }),
      (error: unknown) =>
        !controller.signal.aborted &&
        setData({
          family,
          error: error instanceof Error ? error.message : 'The series did not load.',
        }),
    );
    return () => controller.abort();
  }, [api, tabKey, now]);
  const shown = data?.family === tab?.family ? data : undefined;
  const option = useMemo(() => {
    const lines: ChartSeries[] = (shown?.value ?? []).map((series) => ({
      name: seriesName(series.ref),
      points: seriesPoints(series),
    }));
    return timeSeriesOption(theme.tokens, lines, 7);
  }, [shown, theme.tokens]);
  return (
    <section className={styles.card} aria-labelledby="metrics-title" data-testid="metrics-panel">
      <h2 id="metrics-title" className={styles.cardTitle}>
        Metrics
      </h2>
      {partNote(tabs, 'the series')}
      {tabs.status === 'ready' && list.length === 0 && (
        <p className={styles.muted}>No analysis series cover this area.</p>
      )}
      {tab && (
        <>
          <Tabs
            items={list.map((t) => ({ key: t.family, label: t.label }))}
            value={tab.family}
            onChange={setChosen}
            label="Metric families"
            variant="boxed"
          />
          {!shown && <p className={styles.muted}>Loading {tab.label}…</p>}
          {shown?.error && <p className={styles.error}>{shown.error}</p>}
          {shown?.value && (
            <>
              <EChart
                option={option}
                height={200}
                label={`${tab.label} over the last ${METRICS_DAYS} days (7-day average)`}
                testId="metrics-chart"
              />
              {shown.value.some((series) => series.valuesWithheld) && (
                <p className={styles.muted}>
                  Some values are withheld: a local-only series needs local egress.
                </p>
              )}
              <div className={styles.tiles} data-testid="metric-tiles">
                {shown.value.map((series) => {
                  const tile = statTile(series, TILE_DAYS);
                  return (
                    <div key={series.ref} className={styles.tile}>
                      <span className={styles.tileValue}>
                        {tile.value.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                        {tile.unit ? ` ${tile.unit}` : ''}
                      </span>
                      <span className={styles.tileLabel}>{tile.name}</span>
                      <span className={styles.muted}>
                        {tile.delta === undefined
                          ? `last ${TILE_DAYS}d`
                          : `${tile.delta > 0 ? '+' : ''}${tile.delta}% vs. prev. ${TILE_DAYS}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The Evidence panel, as the mock's EVIDENCE: All and a tab per group with its count; each row an
 * icon for its group, the title, when, its source and family tags, and a confidence tag; the
 * first {@link EVIDENCE_ROWS}, then "View all evidence".
 */
export function EvidencePanel({
  rows,
  onOpen,
}: {
  rows: readonly EvidenceRow[];
  onOpen: (ref: string) => void;
}) {
  const [group, setGroup] = useState<'all' | EvidenceGroup>('all');
  const [all, setAll] = useState(false);
  const counts = useMemo(() => {
    const out = new Map<EvidenceGroup, number>();
    for (const row of rows) out.set(row.group, (out.get(row.group) ?? 0) + 1);
    return out;
  }, [rows]);
  const filtered = group === 'all' ? rows : rows.filter((row) => row.group === group);
  const shown = all ? filtered : filtered.slice(0, EVIDENCE_ROWS);
  return (
    <section className={styles.card} aria-labelledby="evidence-title" data-testid="evidence-panel">
      <h2 id="evidence-title" className={styles.cardTitle}>
        Evidence ({rows.length.toLocaleString('en-US')})
      </h2>
      <Tabs
        items={[
          { key: 'all' as const, label: 'All' },
          ...EVIDENCE_GROUPS.map(({ key, label }) => ({
            key,
            label: `${label} (${(counts.get(key) ?? 0).toLocaleString('en-US')})`,
          })),
        ]}
        value={group}
        onChange={setGroup}
        label="Evidence types"
        variant="pill"
      />
      {shown.length === 0 && <p className={styles.muted}>No evidence of this type.</p>}
      <ul className={styles.rows} aria-label="Evidence">
        {shown.map((row) => {
          const Icon = GROUP_ICONS[row.group];
          const ref = row.ref;
          return (
            <li key={row.key} className={styles.evidenceRow} data-group={row.group}>
              <span className={styles.evidenceIcon} aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className={styles.evidenceText}>
                {ref ? (
                  <button type="button" className={styles.linkButton} onClick={() => onOpen(ref)}>
                    {row.title}
                  </button>
                ) : (
                  <span>{row.title}</span>
                )}
                <span className={styles.muted}>{row.detail}</span>
                <span className={styles.listMeta}>
                  {row.tags.map((tag) => (
                    <Badge key={tag} tone="neutral">
                      {tag}
                    </Badge>
                  ))}
                </span>
              </span>
              {row.confidence && (
                <Badge
                  tone={
                    row.confidence === 'High'
                      ? 'success'
                      : row.confidence === 'Medium'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {row.confidence}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
      {!all && filtered.length > EVIDENCE_ROWS && (
        <button type="button" className={styles.linkButton} onClick={() => setAll(true)}>
          View all evidence →
        </button>
      )}
    </section>
  );
}

/**
 * The Analytic Findings panel: each finding's severity, title, type and when detected, with its
 * base rate and a link to its object; a finding opens its detail, where it can be dismissed if its
 * envelope offers that.
 */
export function FindingsPanel({
  api,
  findings,
  onOpen,
}: {
  api: ForesignalClient | undefined;
  findings: Part<AnalyticFinding[]>;
  onOpen: (ref: string) => void;
}) {
  const [open, setOpen] = useState<AnalyticFinding>();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const list =
    findings.status === 'ready' ? findings.value.filter((f) => !dismissed.has(f.id)) : [];
  return (
    <section className={styles.card} aria-labelledby="findings-title" data-testid="findings-panel">
      <h2 id="findings-title" className={styles.cardTitle}>
        Analytic Findings{findings.status === 'ready' ? ` (${list.length})` : ''}
      </h2>
      {partNote(findings, 'the findings')}
      {findings.status === 'ready' && list.length === 0 && (
        <p className={styles.muted}>No open findings.</p>
      )}
      <ul className={styles.rows} aria-label="Findings">
        {list.map((finding) => {
          const ref = findingRef(finding);
          return (
            <li key={finding.id} className={styles.findingRow}>
              <span className={styles.titleRow}>
                <Badge tone={findingTone(finding.severity)}>{finding.severity}</Badge>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setOpen(finding)}
                >
                  {finding.title}
                </button>
              </span>
              <span className={styles.listMeta}>
                {prettifyId(finding.findingType)} · {utcText(finding.detectedAt)}
                {ref && (
                  <>
                    {' · '}
                    <button type="button" className={styles.linkButton} onClick={() => onOpen(ref)}>
                      Open object
                    </button>
                  </>
                )}
              </span>
              <span className={styles.muted} data-testid="finding-base-rate">
                Base rate: {finding.inference.baseRate.text}
              </span>
            </li>
          );
        })}
      </ul>
      {open && api && (
        <FindingDetail
          api={api}
          finding={open}
          onOpen={onOpen}
          onClose={() => setOpen(undefined)}
          onDismissed={(id) => {
            setDismissed((current) => new Set(current).add(id));
            setOpen(undefined);
          }}
        />
      )}
    </section>
  );
}

/**
 * A finding in full, beside the view: the explanation, the detector and its statistics, the base
 * rate, the caveats and the evidence. Its envelope (`finding:<id>`) says whether this caller may
 * dismiss it (`updateFinding`, with a reason).
 */
function FindingDetail({
  api,
  finding,
  onOpen,
  onClose,
  onDismissed,
}: {
  api: ForesignalClient;
  finding: AnalyticFinding;
  onOpen: (ref: string) => void;
  onClose: () => void;
  onDismissed: (id: string) => void;
}) {
  const [canDismiss, setCanDismiss] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    getObject(api, `finding:${finding.id}`, undefined, controller.signal).then(
      (envelope) =>
        !controller.signal.aborted &&
        setCanDismiss(envelopeAllows(envelope.actions, 'PATCH', /\/analytics\/findings\//)),
      () => undefined,
    );
    return () => controller.abort();
  }, [api, finding.id]);
  const dismiss = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await dismissFinding(api, finding.id, reason.trim());
      onDismissed(finding.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The finding was not dismissed.');
    } finally {
      setBusy(false);
    }
  };
  const { inference } = finding;
  return (
    <aside className={styles.drawer} aria-label="Finding" data-testid="finding-detail">
      <div className={styles.drawerHead}>
        <h2 className={styles.cardTitle}>{finding.title}</h2>
        <IconButton label="Close finding" icon={<X size={15} />} onClick={onClose} />
      </div>
      <div className={styles.titleRow}>
        <Badge tone={findingTone(finding.severity)}>{finding.severity}</Badge>
        <Badge tone="neutral">{prettifyId(finding.findingType)}</Badge>
      </div>
      <p className={styles.text}>{inference.explanation}</p>
      <dl className={styles.facts}>
        <dt>Detector</dt>
        <dd>
          {inference.detector.name} {inference.detector.version}
        </dd>
        <dt>Base rate</dt>
        <dd>{inference.baseRate.text}</dd>
        {Object.entries(inference.stats)
          .filter(([, value]) => typeof value === 'number' || typeof value === 'string')
          .map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{prettifyId(key)}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
      </dl>
      {finding.caveats.length > 0 && (
        <>
          <h3 className={styles.cardTitle}>Caveats</h3>
          <ul className={styles.bulletList}>
            {finding.caveats.map((caveat) => (
              <li key={caveat.code}>{caveat.text}</li>
            ))}
          </ul>
        </>
      )}
      {finding.evidence.members.length > 0 && (
        <>
          <h3 className={styles.cardTitle}>Evidence</h3>
          <ul className={styles.rows}>
            {finding.evidence.members.map((ref) => (
              <li key={ref}>
                <button type="button" className={styles.linkButton} onClick={() => onOpen(ref)}>
                  {ref}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {canDismiss && (
        <div className={styles.form}>
          <input
            className={styles.input}
            aria-label="Reason for dismissing"
            placeholder="Reason for dismissing"
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            variant="primary"
            disabled={busy || !reason.trim()}
            onClick={() => void dismiss()}
          >
            Dismiss finding
          </Button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}

/**
 * The Projected Impacts panel: each impact's family and area, its hazard, the probability of the
 * impact with its interval and sample size, and the historical rate behind it
 * (`listImpactRates`). The backend's labels (a model's output, not an official warning) are shown.
 */
export function ImpactsPanel({
  impacts,
  rates,
}: {
  impacts: Part<ProjectedImpact[]>;
  rates: Part<ImpactRate[]>;
}) {
  const rateList = rates.status === 'ready' ? rates.value : [];
  return (
    <section className={styles.card} aria-labelledby="impacts-title" data-testid="impacts-panel">
      <h2 id="impacts-title" className={styles.cardTitle}>
        Projected Impacts
      </h2>
      {partNote(impacts, 'the impacts')}
      {impacts.status === 'ready' && impacts.value.length === 0 && (
        <p className={styles.muted}>No projected impacts in this area.</p>
      )}
      <ul className={styles.rows} aria-label="Projected impacts">
        {(impacts.status === 'ready' ? impacts.value : []).map((impact) => {
          const rate = rateFor(impact, rateList);
          return (
            <li key={impact.findingId} className={styles.findingRow}>
              <span className={styles.titleRow}>
                <strong>
                  {prettifyId(impact.impactFamily)} · {impact.admin1Name ?? impact.admin1}
                </strong>
                <span className={styles.pill} data-testid="impact-probability">
                  {percentText(impact.pImpact)}
                </span>
              </span>
              <span className={styles.listMeta}>
                {prettifyId(impact.hazard.hazardType)} · interval {percentText(impact.interval.lo)}–
                {percentText(impact.interval.hi)} · n = {impact.n} · hazard{' '}
                {percentText(impact.pHazard)}, given it {percentText(impact.pConditional)}
              </span>
              {rate && (
                <span className={styles.muted}>
                  Base rate:{' '}
                  {rate.status === 'ok'
                    ? `${percentText(rate.rate)}${
                        rate.interval
                          ? ` (${percentText(rate.interval.lo)}–${percentText(rate.interval.hi)})`
                          : ''
                      }, n = ${rate.n}`
                    : `insufficient history (n = ${rate.n})`}
                </span>
              )}
              {impact.labels.length > 0 && (
                <span className={styles.listMeta}>
                  {impact.labels.map((label) => (
                    <Badge key={label} tone="neutral">
                      {label}
                    </Badge>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
