import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Bell, Download, Ellipsis, Link2, StickyNote } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import type { ChangeStream } from '../../api/stream/ChangeStream';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { Tabs, type TabItem } from '../../ui/Tabs';
import { useToast } from '../../ui/toast-context';
import {
  durationText,
  itemRows,
  itemsArea,
  scopeText,
  timelineRows,
  utcText,
  type AnalysisKind,
} from '../../intel/analysisView';
import { getInformationValue, type HypothesisSet } from '../../intel/hypothesisApi';
import { questionScope } from '../../intel/forecastsView';
import { hypothesisScope, informationLevel, primarySet } from '../../intel/hypothesesView';
import { useAnalysis, type Analysis } from '../../intel/useAnalysis';
import type { Part } from '../../intel/useEvidence';
import { useHypothesisSets, useRead } from '../../intel/useHypotheses';
import { useOpenObject } from '../../intel/useOpenObject';
import { useRelatedObjects } from '../../objects/relatedApi';
import { prettifyId } from '../../lib/labels';
import { relationText } from '../global/relatedView';
import { appStore, type AppState, type Store } from '../../state/store';
import { AnalysisHeader } from './AnalysisHeader';
import { AnalysisMap } from './AnalysisMap';
import { AnalysisRail } from './AnalysisRail';
import { AnalysisEvidence } from './EvidenceTab';
import { AssessmentTab } from './AssessmentTab';
import { ObjectNotes } from '../../annotations/ObjectNotes';
import { workbenchPath } from '../workbench/workbench';
import { ForecastsTab } from './ForecastsTab';
import { HypothesesTab } from './HypothesesTab';
import { ExportPanel, InvestigationOverview, ItemsTab } from './InvestigationTabs';
import {
  ANALYSIS_TABS,
  PENDING_TABS,
  problemText,
  RANGES,
  rangeStart,
  type AnalysisTab,
} from './frame';
import { MembersTab, SituationOverview, TimelineList } from './SituationTabs';
import type { InformationLevel } from './AnalysisHeader';
import styles from './Analysis.module.css';

const readValue = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  getInformationValue(api, id, signal);

/** Props for {@link AnalysisView}. */
export interface AnalysisViewProps {
  api?: ForesignalClient;
  stream?: ChangeStream;
  store?: Store<AppState>;
  /** Which kind the route shows. */
  kind: AnalysisKind;
}

/**
 * The full-analysis view (019) for a situation (the Conflict mock) or an investigation (the
 * Tropical-Storm workspace), at `/intelligence/situations/:id` or `/intelligence/investigations/:id`,
 * the tab in `?tab=`. The analysis rail on the left; the header (title and status, the subline, the
 * Confidence gauge, the Information Value meter, Last Updated with auto-refresh, and actions); the
 * tab strip; and the tab. Overview, Full Analysis (023), Timeline, Map, Entities (a situation's
 * members) or Items (an investigation's, added and removed where its envelope allows), Evidence
 * (020), Hypotheses (021), Forecasts (022), Related and, for an investigation, Export are filled;
 * Reports names the prompt that fills it.
 */
export function AnalysisView({ api, stream, store = appStore, kind }: AnalysisViewProps) {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const requested = params.get('tab');
  const tab: AnalysisTab = ANALYSIS_TABS.includes(requested as AnalysisTab)
    ? (requested as AnalysisTab)
    : 'overview';
  const setTab = (next: string) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.set('tab', next);
        return copy;
      },
      { replace: true },
    );
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const [since, setSince] = useState(() => rangeStart(RANGES[1].days, Date.now()));
  const chooseRange = (key: string) => {
    const next = RANGES.find((r) => r.key === key) ?? RANGES[1];
    setRange(next);
    setSince(rangeStart(next.days, Date.now()));
  };
  const { state, refresh } = useAnalysis(api, stream, kind, id, since);
  const open = useOpenObject(api, store);
  const ref = `${kind}:${id}`;
  const related = useRelatedObjects(api, id ? ref : undefined, undefined, true);
  const relatedCount = related.status === 'ready' ? related.related.items.length : undefined;
  // The hypothesis sets (021) feed both the Hypotheses tab and the header's Information Value.
  const scopeKey =
    state.status === 'ready' ? JSON.stringify(hypothesisScope(state.analysis)) : undefined;
  const sets = useHypothesisSets(api, scopeKey);
  const primary = sets.status === 'ready' ? primarySet(sets.value) : undefined;
  const value = useRead(api, primary?.id, readValue);
  const information = informationLevel(value.status === 'ready' ? value.value : undefined);

  const rangeSelect = (
    <label>
      <span className={styles.visuallyHidden}>Time range</span>
      <select
        className={styles.select}
        value={range.key}
        onChange={(event) => chooseRange(event.target.value)}
      >
        {RANGES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );

  const share = () => {
    const url = window.location.href;
    void navigator.clipboard?.writeText(url).then(
      () => toast.show({ title: 'Link copied', detail: url, tone: 'success' }),
      () => toast.show({ title: 'The link could not be copied', detail: url, tone: 'warning' }),
    );
  };

  let body: ReactNode;
  let header: ReactNode = null;
  if (state.status === 'loading') {
    body = (
      <div className={styles.body}>
        <Spinner /> <span className={styles.muted}>Loading the {kind}…</span>
      </div>
    );
  } else if (state.status === 'error') {
    body = (
      <div className={styles.body}>
        <p className={styles.error} role="alert">
          {problemText(state.error, kind)}
        </p>
      </div>
    );
  } else {
    const analysis = state.analysis;
    const memberCount =
      analysis.kind === 'situation'
        ? analysis.members.length
        : (analysis.investigation.items?.length ?? 0);
    const evidenceCount =
      analysis.kind === 'situation'
        ? analysis.members.length
        : (analysis.investigation.items ?? []).filter((item) => item.itemType !== 'note').length;
    header = headerFor(
      analysis,
      state.error,
      information,
      <>
        <Button icon={<StickyNote size={14} />} disabled title="Notes arrive with 026">
          Add Note
        </Button>
        <Button icon={<Link2 size={14} />} onClick={share}>
          Share
        </Button>
        {analysis.kind === 'situation' && (
          <Button
            icon={<Bell size={14} />}
            onClick={() =>
              void navigate(
                `/alerts?new=situation&ref=${encodeURIComponent(analysis.situation.id)}`,
              )
            }
          >
            Create alert
          </Button>
        )}
        {analysis.kind === 'investigation' && (
          <IconButton
            variant="bordered"
            label="Export"
            icon={<Download size={15} />}
            onClick={() => setTab('export')}
          />
        )}
        <IconButton variant="bordered" label="More" icon={<Ellipsis size={15} />} disabled />
      </>,
    );
    const items: TabItem<AnalysisTab>[] = ANALYSIS_TABS.map((key) => ({
      key,
      label: tabLabel(key, analysis.kind, memberCount, relatedCount, evidenceCount),
    }));
    body = (
      <>
        <div className={styles.tabs}>
          <Tabs items={items} value={tab} onChange={setTab} label="Analysis sections" />
        </div>
        <div className={styles.body} data-tab={tab}>
          {renderTab(tab, analysis, {
            api,
            stream,
            open: (target) => void open(target),
            refresh,
            rangeLabel: range.label.toLowerCase(),
            rangeSelect,
            related,
            sets,
          })}
        </div>
      </>
    );
  }

  return (
    <div className={styles.frame} data-testid="analysis-view" data-kind={kind} data-id={id}>
      <AnalysisRail
        tab={tab}
        onTab={setTab}
        onHome={() => void navigate('/intelligence')}
        onWorkbench={() => void navigate(workbenchPath(ref))}
      />
      <div className={styles.main}>
        {header}
        {body}
      </div>
    </div>
  );
}

/**
 * A tab's label: Entities or Items with their count, Evidence with its count, Related with its
 * count once known.
 */
function tabLabel(
  key: AnalysisTab,
  kind: AnalysisKind,
  members: number,
  related: number | undefined,
  evidence?: number,
): string {
  switch (key) {
    case 'analysis':
      return 'Full Analysis';
    case 'entities':
      return `${kind === 'situation' ? 'Entities' : 'Items'} (${members.toLocaleString('en-US')})`;
    case 'evidence':
      return evidence === undefined ? 'Evidence' : `Evidence (${evidence.toLocaleString('en-US')})`;
    case 'related':
      return related === undefined ? 'Related' : `Related (${related.toLocaleString('en-US')})`;
    default:
      return prettifyId(key);
  }
}

/** The header for a loaded analysis, with its primary hypothesis set's information value. */
function headerFor(
  analysis: Analysis,
  refreshError: string | undefined,
  information: InformationLevel | undefined,
  actions: ReactNode,
) {
  if (analysis.kind === 'situation') {
    const { situation } = analysis;
    const ended = situation.closedAt ?? undefined;
    return (
      <AnalysisHeader
        section="Situations"
        title={situation.title}
        status={situation.status}
        subline={
          <>
            {prettifyId(situation.theme)} · Started {situation.startedAt.slice(0, 10)} ·{' '}
            {durationText(situation.startedAt, ended ? new Date(ended) : new Date())} ·{' '}
            {scopeText(situation.regionCodes)}
          </>
        }
        confidence={situation.corroborationShare}
        information={information}
        updatedAt={situation.updatedAt ?? situation.lastActivityAt}
        refreshError={refreshError}
        actions={actions}
      />
    );
  }
  const { investigation } = analysis;
  return (
    <AnalysisHeader
      section="Investigations"
      title={investigation.title}
      status={investigation.status}
      subline={
        <>
          Investigation · ID: {investigation.displayId} · {utcText(investigation.createdAt)} →{' '}
          {utcText(investigation.updatedAt)} · UTC
          {investigation.tlp && (
            <>
              {' '}
              <Badge tone="warning">TLP:{investigation.tlp}</Badge>
            </>
          )}
        </>
      }
      information={information}
      updatedAt={investigation.updatedAt}
      refreshError={refreshError}
      actions={actions}
    />
  );
}

/** What a tab needs besides the analysis. */
interface TabContext {
  api: ForesignalClient | undefined;
  stream: ChangeStream | undefined;
  open: (ref: string) => void;
  refresh: () => void;
  rangeLabel: string;
  rangeSelect: ReactNode;
  related: ReturnType<typeof useRelatedObjects>;
  sets: Part<HypothesisSet[]>;
}

/** The open tab's content. */
function renderTab(tab: AnalysisTab, analysis: Analysis, context: TabContext): ReactNode {
  const pending = PENDING_TABS[tab];
  if (pending) {
    return (
      <div className={styles.pending} data-testid="pending-tab">
        <strong>{tabLabel(tab, analysis.kind, 0, undefined)}</strong>
        <span>This tab is filled by {pending}.</span>
      </div>
    );
  }
  switch (tab) {
    case 'overview':
      return analysis.kind === 'situation' ? (
        <SituationOverview
          analysis={analysis}
          rangeLabel={context.rangeLabel}
          onOpen={context.open}
        />
      ) : (
        <InvestigationOverview analysis={analysis} />
      );
    case 'timeline':
      return (
        <div data-testid="timeline-tab">
          <div className={styles.toolbar}>{context.rangeSelect}</div>
          <TimelineList
            rows={
              analysis.kind === 'situation'
                ? timelineRows(analysis.timeline)
                : itemRows(analysis.investigation.items ?? [])
            }
            onOpen={context.open}
          />
        </div>
      );
    case 'map':
      return <MapTab analysis={analysis} context={context} />;
    case 'entities':
      return analysis.kind === 'situation' ? (
        <MembersTab api={context.api} members={analysis.members} onOpen={context.open} />
      ) : (
        <ItemsTab
          api={context.api}
          analysis={analysis}
          onOpen={context.open}
          onChanged={context.refresh}
        />
      );
    case 'evidence':
      return <AnalysisEvidence api={context.api} analysis={analysis} onOpen={context.open} />;
    case 'hypotheses':
      return <HypothesesTab api={context.api} sets={context.sets} onOpen={context.open} />;
    case 'analysis':
      return (
        <AssessmentTab
          api={context.api}
          situationId={analysis.kind === 'situation' ? analysis.situation.id : undefined}
          onOpen={context.open}
          notes={
            analysis.kind === 'situation' ? (
              <ObjectNotes
                api={context.api}
                objectRef={`situation:${analysis.situation.id}`}
                heading="Analyst Notes"
              />
            ) : undefined
          }
        />
      );
    case 'forecasts':
      return <ForecastsTab api={context.api} scope={questionScope(analysis)} />;
    case 'related':
      return <RelatedTab state={context.related} onOpen={context.open} />;
    case 'export':
      return analysis.kind === 'investigation' ? (
        <ExportPanel api={context.api} analysis={analysis} />
      ) : (
        <div className={styles.pending} data-testid="pending-tab">
          <strong>Export</strong>
          <span>The backend exports investigations, not situations.</span>
        </div>
      );
    default:
      return null;
  }
}

/** The Map tab for either kind: the situation's geometry, or the items' snapshot geometries. */
function MapTab({ analysis, context }: { analysis: Analysis; context: TabContext }) {
  const area = useMemo(() => {
    if (analysis.kind === 'situation') {
      const kinds = analysis.members
        .filter((member) => member.memberType === 'record' && member.kind)
        .map((member) => member.kind!);
      return {
        areas: [analysis.situation.geometry],
        bbox: analysis.situation.bbox,
        kinds: [...new Set(kinds)],
      };
    }
    const items = analysis.investigation.items ?? [];
    const { geometries, bbox } = itemsArea(items);
    const kinds = items
      .map((item) => item.snapshot?.['kind'])
      .filter((kind): kind is string => typeof kind === 'string');
    return { areas: geometries, bbox, kinds: [...new Set(kinds)] };
  }, [analysis]);
  return (
    <AnalysisMap
      api={context.api}
      stream={context.stream}
      areas={area.areas}
      bbox={area.bbox}
      kinds={area.kinds}
      toolbar={context.rangeSelect}
    />
  );
}

/** The Related tab: the objects the relation graph links to the situation or investigation. */
function RelatedTab({
  state,
  onOpen,
}: {
  state: ReturnType<typeof useRelatedObjects>;
  onOpen: (ref: string) => void;
}) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <p className={styles.muted}>Loading related objects…</p>;
  }
  if (state.status === 'error') return <p className={styles.error}>{state.message}</p>;
  const { items } = state.related;
  if (items.length === 0) return <p className={styles.muted}>Nothing is related yet.</p>;
  return (
    <ul className={styles.rows} aria-label="Related" data-testid="related-tab">
      {items.map((item) => (
        <li key={`${item.relation.id}-${item.object.ref}`} className={styles.row}>
          <button
            type="button"
            className={styles.rowButton}
            onClick={() => onOpen(item.object.ref)}
          >
            <span className={styles.rowDay}>{prettifyId(item.object.type)}</span>
            <span className={styles.rowTitle}>{item.object.title}</span>
            <Badge tone="info">{relationText(item)}</Badge>
            <span className={styles.muted}>{item.direction === 'in' ? '←' : '→'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
