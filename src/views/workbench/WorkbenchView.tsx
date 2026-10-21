import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ObjectNotes } from '../../annotations/ObjectNotes';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import { useToken } from '../../api/useToken';
import type { ViewGraph } from '../../graph/graphView';
import { BookOpen, Download, Share2, StickyNote } from 'lucide-react';
import { analysisPath, itemRows, timelineRows, utcText } from '../../intel/analysisView';
import {
  getHypothesisSet,
  listIndicators,
  type HypothesisSet,
  type Indicator,
} from '../../intel/hypothesisApi';
import { hypothesisScope, primarySet } from '../../intel/hypothesesView';
import { listInvestigations, type Investigation } from '../../intel/investigationApi';
import { useAnalysis, type Analysis, type AnalysisState } from '../../intel/useAnalysis';
import type { Part } from '../../intel/useEvidence';
import { useHypothesisSets, useRead } from '../../intel/useHypotheses';
import { useOpenObject } from '../../intel/useOpenObject';
import { hitForRef, selectionRef } from '../../objects/selectObject';
import { Button } from '../../ui/Button';
import { useWorkspaceSync } from '../../workspace/workspaceSyncContext';
import type { AppState, Store } from '../../state/store';
import { useStoreKey } from '../../state/store';
import { EvidenceGraph } from './EvidenceGraph';
import { GraphSidePanel } from './GraphSidePanel';
import {
  investigationSeeds,
  WORKBENCH_TABS,
  WORKBENCH_TOOLS,
  workbenchPath,
  type WorkbenchSubject,
} from './workbench';
import { problemText, RANGES, rangeStart } from '../analysis/frame';
import { HypothesesPanel } from '../analysis/HypothesesTab';
import { TimelineList } from '../analysis/SituationTabs';
import analysis from '../analysis/Analysis.module.css';
import { SAVED_ENTRIES } from '../../saved/savedEntries';
import styles from './Workbench.module.css';

/** Props for {@link WorkbenchView}. */
export interface WorkbenchViewProps {
  api: ForesignalClient | undefined;
  store: Store<AppState>;
  /** What the route opens: an investigation or a situation by its `:id`; otherwise `?ref=`. */
  kind?: 'investigation' | 'situation';
}

/** The subject and its graph seeds, once read, with an investigation's header facts. */
interface Opened {
  title: string;
  seeds: string[];
  facts?: { label: string; value: string }[];
}

/** The Evidence Timeline's window for a situation, as the graph's own default. */
const TIMELINE_RANGE = RANGES[2];

/** No seeds, the same list on every render. */
const NO_SEEDS: readonly string[] = [];

/** While a read is under way, the same value on every render. */
const LOADING = { status: 'loading' } as const;

const readSet = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  getHypothesisSet(api, id, signal);
const readIndicators = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  listIndicators(api, { setId: id }, signal);

/**
 * The Analyst Workbench (024), as the mock lays it out: the ANALYSIS TOOLS rail, the header, the
 * row of tabs, the EVIDENCE GRAPH in the center with COMPETING HYPOTHESES and the EVIDENCE TIMELINE
 * under it, and the SELECTED ENTITY panel on the right. It opens on an investigation
 * (`/analyst/investigations/:id`, its items as the graph's seeds), a situation
 * (`/analyst/situations/:id`), or objects by ref (`/analyst?ref=…`). With none, it offers the
 * selected object and the investigations to open. Selecting a node selects it app-wide (014) and
 * shows it in the side panel. An investigation or situation is read as its full analysis is (019,
 * `useAnalysis`); the hypotheses are its primary set's (021) and the timeline its own, in the
 * full analysis's components.
 */
export function WorkbenchView({ api, store, kind }: WorkbenchViewProps) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const refs = params.getAll('ref');
  const subject: WorkbenchSubject =
    kind && id ? { kind, id } : refs.length > 0 ? { kind: 'refs', refs } : { kind: 'none' };
  const analysisKind =
    subject.kind === 'investigation' || subject.kind === 'situation' ? subject.kind : undefined;
  const [since] = useState(() => rangeStart(TIMELINE_RANGE.days, Date.now()));
  const { state } = useAnalysis(
    analysisKind ? api : undefined,
    undefined,
    analysisKind ?? 'investigation',
    analysisKind && 'id' in subject ? subject.id : '',
    since,
  );
  const refsOpened = useRead(
    api,
    subject.kind === 'refs' ? JSON.stringify(subject.refs) : undefined,
    async (_client, key): Promise<Opened> => {
      const seeds = JSON.parse(key) as string[];
      return { title: seeds.length === 1 ? (seeds[0] ?? '') : `${seeds.length} objects`, seeds };
    },
  );
  const analysisOpened = useMemo(
    () => (analysisKind ? openedOf(state, analysisKind) : undefined),
    [state, analysisKind],
  );
  const opened = analysisOpened ?? refsOpened;
  // The analysis is read again every minute; the graph keeps its seeds while they are the same.
  const seedsKey = JSON.stringify(opened.status === 'ready' ? opened.value.seeds : NO_SEEDS);
  const seeds = useMemo(() => JSON.parse(seedsKey) as string[], [seedsKey]);
  const loaded = state.status === 'ready' && analysisKind ? state.analysis : undefined;
  const scopeKey = loaded ? JSON.stringify(hypothesisScope(loaded)) : undefined;
  const sets = useHypothesisSets(api, scopeKey);
  const primary = sets.status === 'ready' ? primarySet(sets.value) : undefined;
  const [setVersion, setSetVersion] = useState(0);
  const setDetail = useRead(api, primary?.id, readSet, setVersion);
  const indicators = useRead(api, primary?.id, readIndicators, setVersion);
  const set = setDetail.status === 'ready' ? setDetail.value : primary;
  const [selected, setSelected] = useState<string>();
  const [graph, setGraph] = useState<ViewGraph>();
  const [graphVersion, setGraphVersion] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const navigate = useNavigate();
  const open = useOpenObject(api, store);
  const workspaces = useWorkspaceSync();
  const onSelect = useCallback(
    (ref: string | undefined) => {
      setSelected(ref);
      if (!ref || !api) return;
      hitForRef(api, ref).then(
        (hit) => store.set('selection', hit),
        () => undefined,
      );
    },
    [api, store],
  );
  const subjectRef =
    subject.kind === 'investigation' || subject.kind === 'situation'
      ? `${subject.kind}:${subject.id}`
      : undefined;
  const fullAnalysis = subjectRef ? analysisPath(subjectRef) : undefined;

  return (
    <div className={analysis.frame}>
      <nav className={analysis.rail} aria-label="Analysis tools">
        <h2 className={analysis.railHeading}>Analysis Tools</h2>
        {WORKBENCH_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const target = tool.tab && fullAnalysis ? `${fullAnalysis}?tab=${tool.tab}` : undefined;
          return (
            <button
              key={tool.label}
              type="button"
              className={analysis.railItem}
              aria-current={tool.current ? 'true' : undefined}
              disabled={!tool.current && !target}
              title={
                tool.current || target
                  ? undefined
                  : tool.tab
                    ? `${tool.label}: open an investigation or situation first`
                    : `${tool.label}: not built; the backend offers no operation for it`
              }
              onClick={() => target && void navigate(target)}
            >
              <Icon size={15} aria-hidden="true" />
              {tool.label}
            </button>
          );
        })}
        <h2 className={analysis.railHeading}>Workspace</h2>
        <button
          type="button"
          className={analysis.railItem}
          disabled={!workspaces}
          onClick={() => workspaces?.openDialog()}
        >
          <BookOpen size={15} aria-hidden="true" />
          Workspaces
        </button>
        <button
          type="button"
          className={analysis.railItem}
          disabled={!subjectRef}
          aria-pressed={subjectRef ? notesOpen : undefined}
          title={subjectRef ? undefined : 'Notes: open an investigation or situation first'}
          onClick={() => setNotesOpen((open) => !open)}
        >
          <StickyNote size={15} aria-hidden="true" />
          Notes
        </button>
        {SAVED_ENTRIES.map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            className={analysis.railItem}
            onClick={() => store.set('savedOpen', tab)}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      <main className={analysis.main}>
        <header className={analysis.header}>
          <div className={analysis.headline}>
            <h1 className={analysis.title}>Analyst Workbench</h1>
            <span className={analysis.subline}>
              {opened.status === 'ready'
                ? opened.value.title
                : 'Investigate. Correlate. Test hypotheses. Build intelligence.'}
            </span>
          </div>
          {opened.status === 'ready' &&
            opened.value.facts?.map((fact) => (
              <div key={fact.label} className={analysis.metric}>
                <span className={analysis.metricLabel}>{fact.label}</span>
                <span className={analysis.metricValue}>{fact.value}</span>
              </div>
            ))}
          <div className={styles.headerActions}>
            {workspaces && (
              <Button icon={<Share2 size={14} />} onClick={() => workspaces.openDialog()}>
                Share
              </Button>
            )}
            {fullAnalysis && subject.kind === 'investigation' && (
              <Button
                icon={<Download size={14} />}
                onClick={() => void navigate(`${fullAnalysis}?tab=export`)}
              >
                Export
              </Button>
            )}
            {fullAnalysis && (
              <Link className={styles.headerLink} to={fullAnalysis}>
                Full analysis →
              </Link>
            )}
          </div>
        </header>
        {fullAnalysis && (
          <nav className={styles.tabRow} aria-label="Workbench sections">
            {WORKBENCH_TABS.map((entry) => {
              const target = entry.tab ? `${fullAnalysis}?tab=${entry.tab}` : undefined;
              const count = entry.counted && set ? ` (${set.hypotheses.length})` : '';
              return (
                <button
                  key={entry.label}
                  type="button"
                  className={styles.tab}
                  aria-current={entry.current ? 'page' : undefined}
                  aria-pressed={entry.notes ? notesOpen : undefined}
                  disabled={!entry.current && !entry.notes && !target}
                  title={
                    entry.current || entry.notes || target
                      ? undefined
                      : `${entry.label}: not built; there is no screen for it`
                  }
                  onClick={() => {
                    if (entry.notes) setNotesOpen((open) => !open);
                    else if (target) void navigate(target);
                  }}
                >
                  {entry.label}
                  {count}
                </button>
              );
            })}
          </nav>
        )}
        {subject.kind === 'none' ? (
          <WorkbenchStart api={api} store={store} />
        ) : opened.status === 'error' ? (
          <p className={`${analysis.muted} ${styles.pad}`} role="alert">
            {opened.message}
          </p>
        ) : (
          <div className={styles.body}>
            <div className={styles.mainColumn}>
              <EvidenceGraph
                api={api}
                seeds={seeds}
                onSelect={onSelect}
                onGraph={setGraph}
                version={graphVersion}
                {...(selected !== undefined && { selected })}
              />
              {loaded && fullAnalysis && (
                <div className={styles.bottomRow}>
                  <HypothesesCard
                    api={api}
                    sets={sets}
                    set={set}
                    indicators={indicators}
                    kind={loaded.kind}
                    onAdded={() => setSetVersion((version) => version + 1)}
                    onMatrix={() => void navigate(`${fullAnalysis}?tab=hypotheses`)}
                  />
                  <EvidenceTimeline analysis={loaded} onOpen={(ref) => void open(ref)} />
                </div>
              )}
            </div>
            <div className={styles.sideColumn}>
              {notesOpen && subjectRef && (
                <section className={`${analysis.card} ${styles.subjectNotes}`}>
                  <ObjectNotes api={api} objectRef={subjectRef} />
                </section>
              )}
              <GraphSidePanel
                api={api}
                graph={graph}
                selected={selected}
                onSelect={onSelect}
                onOpen={(ref) => void open(ref)}
                onGraphChanged={() => setGraphVersion((version) => version + 1)}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * The workbench's view of a full-analysis read: the title, the graph's seeds (an investigation
 * and its items' objects, or the situation) and an investigation's header facts.
 */
function openedOf(state: AnalysisState, kind: 'investigation' | 'situation'): Part<Opened> {
  if (state.status === 'loading') return LOADING;
  if (state.status === 'error') {
    return { status: 'error', message: problemText(state.error, kind) };
  }
  const loaded = state.analysis;
  if (loaded.kind === 'investigation') {
    const { investigation } = loaded;
    return {
      status: 'ready',
      value: {
        title: investigation.title,
        seeds: investigationSeeds(investigation),
        facts: investigationFacts(investigation),
      },
    };
  }
  return {
    status: 'ready',
    value: { title: loaded.situation.title, seeds: [`situation:${loaded.situation.id}`] },
  };
}

/**
 * COMPETING HYPOTHESES under the graph: the primary set's hypotheses in the full analysis's own
 * panel (021), its "View hypothesis analysis" opening the Hypotheses tab; or why there are none.
 */
function HypothesesCard({
  api,
  sets,
  set,
  indicators,
  kind,
  onAdded,
  onMatrix,
}: {
  api: ForesignalClient | undefined;
  sets: Part<unknown>;
  set: HypothesisSet | undefined;
  indicators: Part<Indicator[]>;
  kind: Analysis['kind'];
  onAdded: () => void;
  onMatrix: () => void;
}) {
  if (set) {
    return (
      <HypothesesPanel
        api={api}
        set={set}
        indicators={indicators.status === 'ready' ? indicators.value : []}
        onAdded={onAdded}
        onMatrix={onMatrix}
      />
    );
  }
  let note: ReactNode;
  if (sets.status === 'loading') note = 'Loading the hypothesis sets…';
  else if (sets.status === 'error') note = sets.message;
  else note = `No hypothesis sets are linked to this ${kind}.`;
  return (
    <section className={analysis.card} aria-labelledby="hypotheses-title">
      <h2 id="hypotheses-title" className={analysis.cardTitle}>
        Competing Hypotheses
      </h2>
      <p className={analysis.muted}>{note}</p>
    </section>
  );
}

/**
 * The EVIDENCE TIMELINE under the graph, in the full analysis's timeline list: a situation's
 * timeline over {@link TIMELINE_RANGE}, or an investigation's items as they were added.
 */
function EvidenceTimeline({
  analysis: loaded,
  onOpen,
}: {
  analysis: Analysis;
  onOpen: (ref: string) => void;
}) {
  const rows = useMemo(
    () =>
      loaded.kind === 'situation'
        ? timelineRows(loaded.timeline)
        : itemRows(loaded.investigation.items ?? []),
    [loaded],
  );
  return (
    <section
      className={`${analysis.card} ${styles.timelineCard}`}
      aria-labelledby="evidence-timeline-title"
      data-testid="evidence-timeline"
    >
      <div className={analysis.drawerHead}>
        <h2 id="evidence-timeline-title" className={analysis.cardTitle}>
          Evidence Timeline
        </h2>
        <span className={analysis.muted}>
          {loaded.kind === 'situation' ? TIMELINE_RANGE.label : 'Items as added'}
        </span>
      </div>
      <TimelineList rows={rows} onOpen={onOpen} />
    </section>
  );
}

/**
 * What the workbench offers with nothing open: the object selected elsewhere in the app, and the
 * investigations the caller can see (`listInvestigations`, which needs a token).
 */
function WorkbenchStart({
  api,
  store,
}: {
  api: ForesignalClient | undefined;
  store: Store<AppState>;
}) {
  const selection = useStoreKey('selection', store);
  const selectedRef = selectionRef(selection);
  // The listing always needs a token, so with none it is not asked for.
  const token = useToken();
  const read = useRead(
    api,
    token === null ? undefined : `investigations#${token ?? ''}`,
    (client, _key, signal) => listInvestigations(client, signal),
  );
  const investigations = token === null ? NO_TOKEN : read;
  return (
    <div className={styles.start}>
      <section className={analysis.card} aria-label="Open the workbench">
        <h2 className={analysis.cardTitle}>Start from</h2>
        {selectedRef ? (
          <Link to={workbenchPath(selectedRef)}>Graph the selected object: {selection?.title}</Link>
        ) : (
          <p className={analysis.muted}>
            Select an object on the map, or open an investigation, to graph its relations.
          </p>
        )}
      </section>
      <section className={analysis.card} aria-label="Investigations">
        <h2 className={analysis.cardTitle}>Investigations</h2>
        {investigations.status === 'loading' && <p className={analysis.muted}>Loading…</p>}
        {investigations.status === 'error' && (
          <p className={analysis.muted}>{investigationsProblem(investigations.message)}</p>
        )}
        {investigations.status === 'ready' && investigations.value.length === 0 && (
          <p className={analysis.muted}>No investigations yet.</p>
        )}
        {investigations.status === 'ready' && investigations.value.length > 0 && (
          <ul className={analysis.rows}>
            {investigations.value.map((investigation) => (
              <li key={investigation.id}>
                <Link to={workbenchPath(`investigation:${investigation.id}`)}>
                  {investigation.title}
                </Link>{' '}
                <span className={analysis.muted}>
                  {investigation.displayId} · {investigation.status} ·{' '}
                  {investigation.itemCount ?? investigation.items?.length ?? 0} items
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * An investigation's header facts, as the mock's Workbench header lists them: Classify (its TLP),
 * Status, Owner, Created and Last Updated, each in the backend's words.
 */
function investigationFacts(investigation: Investigation): { label: string; value: string }[] {
  return [
    { label: 'Classify', value: investigation.tlp ? `TLP:${investigation.tlp}` : '—' },
    { label: 'Status', value: investigation.status },
    { label: 'Owner', value: investigation.owner?.displayName ?? investigation.createdBy },
    { label: 'Created', value: utcText(investigation.createdAt) },
    { label: 'Last Updated', value: utcText(investigation.updatedAt) },
  ];
}

/** The investigations listing with no token set: not asked for, since it would be refused. */
const NO_TOKEN = { status: 'error', message: 'This needs a token.' } as const;

/** What a failed investigations read says. */
function investigationsProblem(message: string): string {
  return /token/i.test(message)
    ? 'Listing investigations needs an access token. Add one in Settings.'
    : message;
}
