import { useCallback, useState } from 'react';
import { ObjectNotes } from '../../annotations/ObjectNotes';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import type { ViewGraph } from '../../graph/graphView';
import { BookOpen, Download, Share2, StickyNote } from 'lucide-react';
import { analysisPath, utcText } from '../../intel/analysisView';
import {
  getInvestigation,
  listInvestigations,
  type Investigation,
} from '../../intel/investigationApi';
import { getSituation } from '../../intel/situationApi';
import { useRead } from '../../intel/useHypotheses';
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
  WORKBENCH_TOOLS,
  workbenchPath,
  type WorkbenchSubject,
} from './workbench';
import analysis from '../analysis/Analysis.module.css';
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

/**
 * The Analyst Workbench (024), as the mock lays it out: the ANALYSIS TOOLS rail, the header, the
 * EVIDENCE GRAPH in the center and the SELECTED ENTITY panel on the right. It opens on an
 * investigation (`/analyst/investigations/:id`, its items as the graph's seeds), a situation
 * (`/analyst/situations/:id`), or objects by ref (`/analyst?ref=…`). With none, it offers the
 * selected object and the investigations to open. Selecting a node selects it app-wide (014) and
 * shows it in the side panel.
 */
export function WorkbenchView({ api, store, kind }: WorkbenchViewProps) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const refs = params.getAll('ref');
  const subject: WorkbenchSubject =
    kind && id ? { kind, id } : refs.length > 0 ? { kind: 'refs', refs } : { kind: 'none' };
  const opened = useRead(
    api,
    subject.kind === 'none' ? undefined : JSON.stringify(subject),
    async (client, key, signal): Promise<Opened> => {
      const which = JSON.parse(key) as WorkbenchSubject;
      if (which.kind === 'investigation') {
        const investigation = await getInvestigation(client, which.id, signal);
        return {
          title: investigation.title,
          seeds: investigationSeeds(investigation),
          facts: investigationFacts(investigation),
        };
      }
      if (which.kind === 'situation') {
        const situation = await getSituation(client, which.id, signal);
        return { title: situation.title, seeds: [`situation:${which.id}`] };
      }
      const seeds = which.kind === 'refs' ? which.refs : [];
      return { title: seeds.length === 1 ? (seeds[0] ?? '') : `${seeds.length} objects`, seeds };
    },
  );
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
        {subject.kind === 'none' ? (
          <WorkbenchStart api={api} store={store} />
        ) : opened.status === 'error' ? (
          <p className={`${analysis.muted} ${styles.pad}`} role="alert">
            {opened.message}
          </p>
        ) : (
          <div className={styles.body}>
            <EvidenceGraph
              api={api}
              seeds={opened.status === 'ready' ? opened.value.seeds : []}
              onSelect={onSelect}
              onGraph={setGraph}
              version={graphVersion}
              {...(selected !== undefined && { selected })}
            />
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
  const investigations = useRead(api, 'investigations', (client, _key, signal) =>
    listInvestigations(client, signal),
  );
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

/** What a failed investigations read says. */
function investigationsProblem(message: string): string {
  return /token/i.test(message)
    ? 'Listing investigations needs an access token. Add one in Settings.'
    : message;
}
