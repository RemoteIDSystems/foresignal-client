import { useEffect, useMemo, useState } from 'react';
import type { ForesignalClient } from '../../api/client';
import {
  findCommonDependencies,
  queryGraph,
  RELATION_TYPES,
  type CommonDependencies,
  type GraphNode,
  type GraphResult,
  type RelationType,
} from '../../graph/graphApi';
import {
  commonViewGraph,
  edgeFamily,
  GRAPH_WINDOWS,
  graphMatrix,
  graphRows,
  matchesSearch,
  nodeSources,
  nodeTypes,
  toViewGraph,
  type GraphFilters,
  type ViewGraph,
} from '../../graph/graphView';
import { RelationGraph } from '../../graph/RelationGraph';
import { useGraphColors } from '../../graph/useGraphColors';
import { utcText } from '../../intel/analysisView';
import type { Part } from '../../intel/useEvidence';
import { useRead } from '../../intel/useHypotheses';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import { commonRefs, type GraphQueryKey } from './workbench';
import analysis from '../analysis/Analysis.module.css';
import styles from './Workbench.module.css';

type GraphMode = 'graph' | 'list' | 'matrix';

const VIEW_TABS = [
  { key: 'graph', label: 'Graph View' },
  { key: 'list', label: 'List View' },
  { key: 'matrix', label: 'Matrix View' },
] as const;

/** The default time window: the mock's "Last 90 days". */
const DEFAULT_DAYS = 90;

/** What the graph card hands up: the drawn graph, for the side panel. */
export interface EvidenceGraphProps {
  api: ForesignalClient | undefined;
  /** The refs the graph is read around. */
  seeds: readonly string[];
  /** The selected node's ref. */
  selected?: string;
  onSelect: (ref: string | undefined) => void;
  /** Called with each graph drawn, so the side panel reads the same one. */
  onGraph: (graph: ViewGraph) => void;
}

/**
 * The EVIDENCE GRAPH card (024): the subgraph around the seeds (`queryGraph`) as a Graph, List or
 * Matrix view, with a search that keeps matching nodes bright, and filters. The object type, source
 * and time window filter what was read; the depth and the relation type read the subgraph again.
 * The Common dependencies mode shows instead what the seeds share (`findCommonDependencies`).
 */
export function EvidenceGraph({ api, seeds, selected, onSelect, onGraph }: EvidenceGraphProps) {
  const [mode, setMode] = useState<GraphMode>('graph');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [source, setSource] = useState('');
  const [days, setDays] = useState<number | undefined>(DEFAULT_DAYS);
  const [depth, setDepth] = useState<1 | 2>(1);
  const [relation, setRelation] = useState<RelationType | ''>('');
  const [common, setCommon] = useState(false);

  const queryKey = JSON.stringify({
    seeds: [...seeds],
    depth,
    ...(relation && { relation }),
  } satisfies GraphQueryKey);
  const result = useRead(api, seeds.length > 0 ? queryKey : undefined, (client, key, signal) => {
    const query = JSON.parse(key) as GraphQueryKey;
    return queryGraph(
      client,
      { refs: query.seeds, depth: query.depth, ...(query.relation && { types: [query.relation] }) },
      signal,
    );
  });
  const sharedRefs = commonRefs(seeds);
  const commonPart = useRead(
    api,
    common && sharedRefs.length >= 2 ? JSON.stringify(sharedRefs) : undefined,
    (client, key, signal) =>
      findCommonDependencies(client, JSON.parse(key) as string[], undefined, signal),
  );

  // Taken once, when the card opens, so the time window does not move between renders.
  const [now] = useState(() => Date.now());
  const filters = useMemo(
    (): GraphFilters => ({
      types: type ? [type] : [],
      ...(source && { source }),
      ...(days !== undefined && { days }),
    }),
    [type, source, days],
  );
  const graph = useMemo((): ViewGraph | undefined => {
    if (common) {
      if (commonPart.status !== 'ready') return undefined;
      const known = new Map<string, GraphNode>(
        result.status === 'ready' ? result.value.nodes.map((node) => [node.ref, node]) : [],
      );
      return commonViewGraph(commonPart.value, known);
    }
    return result.status === 'ready' ? toViewGraph(result.value, seeds, filters, now) : undefined;
  }, [common, commonPart, result, seeds, filters, now]);

  // The side panel reads the graph that is drawn.
  useEffect(() => {
    if (graph) onGraph(graph);
  }, [graph, onGraph]);

  const nodes = result.status === 'ready' ? result.value.nodes : [];
  const shownPart: Part<unknown> = common ? commonPart : result;
  return (
    <section className={`${analysis.card} ${styles.graphCard}`} aria-label="Evidence graph">
      <div className={analysis.toolbar}>
        <Tabs items={VIEW_TABS} value={mode} onChange={setMode} label="Graph view" variant="pill" />
        <input
          className={analysis.input}
          type="search"
          placeholder="Search entities, events, or relationships…"
          aria-label="Search the graph"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className={analysis.select}
          aria-label="Object type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">All Types</option>
          {nodeTypes(nodes).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <select
          className={analysis.select}
          aria-label="Source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option value="">All Sources</option>
          {nodeSources(nodes).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <select
          className={analysis.select}
          aria-label="Time window"
          value={days ?? ''}
          onChange={(event) => setDays(event.target.value ? Number(event.target.value) : undefined)}
        >
          {GRAPH_WINDOWS.map((window) => (
            <option key={window.label} value={window.days ?? ''}>
              {window.label}
            </option>
          ))}
        </select>
        <select
          className={analysis.select}
          aria-label="Depth"
          value={depth}
          onChange={(event) => setDepth(event.target.value === '2' ? 2 : 1)}
        >
          <option value="1">1 hop</option>
          <option value="2">2 hops</option>
        </select>
        <select
          className={analysis.select}
          aria-label="Relation type"
          value={relation}
          onChange={(event) => setRelation(event.target.value as RelationType | '')}
        >
          <option value="">All relations</option>
          {RELATION_TYPES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <Button
          variant={common ? 'primary' : 'default'}
          aria-pressed={common}
          disabled={sharedRefs.length < 2}
          title={
            sharedRefs.length < 2
              ? 'Common dependencies need at least two objects other than the investigation'
              : undefined
          }
          onClick={() => setCommon((value) => !value)}
        >
          Common dependencies
        </Button>
      </div>

      {shownPart.status === 'loading' && seeds.length > 0 && (
        <p className={analysis.muted}>Reading the graph…</p>
      )}
      {shownPart.status === 'error' && (
        <p className={analysis.muted} role="alert">
          {shownPart.message}
        </p>
      )}
      {seeds.length === 0 && <p className={analysis.muted}>Nothing to graph yet.</p>}

      {graph && graph.nodes.length === 0 && (
        <p className={analysis.muted}>
          {common
            ? 'These objects share no dependencies.'
            : 'No related objects were found for these filters.'}
        </p>
      )}
      {graph && graph.nodes.length > 0 && (
        <div className={styles.graphBody}>
          {mode === 'graph' && (
            <RelationGraph
              graph={graph}
              search={search}
              onSelect={onSelect}
              {...(selected !== undefined && { selected })}
            />
          )}
          {mode === 'list' && (
            <GraphList graph={graph} search={search} selected={selected} onSelect={onSelect} />
          )}
          {mode === 'matrix' && <GraphMatrixView graph={graph} onSelect={onSelect} />}
        </div>
      )}

      {graph && (
        <p className={analysis.muted} data-testid="graph-status">
          {graph.nodes.length} objects · {graph.edges.length} relations
          {!common && result.status === 'ready' && <GraphNotes result={result.value} />}
        </p>
      )}
      {common && commonPart.status === 'ready' && (
        <CommonList common={commonPart.value} onSelect={onSelect} />
      )}
    </section>
  );
}

/** What the backend says about the read: capped at its edge limit, or refs it could not read. */
function GraphNotes({ result }: { result: GraphResult }) {
  return (
    <>
      {result.truncated && ' · capped at the backend’s edge limit'}
      {(result.missing?.length ?? 0) > 0 && ` · ${result.missing?.length} not readable`}
    </>
  );
}

/** The List view: a row per object, the most connected first; a search keeps only its matches. */
function GraphList({
  graph,
  search,
  selected,
  onSelect,
}: {
  graph: ViewGraph;
  search: string;
  selected: string | undefined;
  onSelect: (ref: string) => void;
}) {
  const rows = graphRows(graph).filter((row) => !search.trim() || matchesSearch(row.node, search));
  return (
    <div className={analysis.tableWrap}>
      <table className={analysis.table} data-testid="graph-list">
        <thead>
          <tr>
            <th>Object</th>
            <th>Type</th>
            <th>Relations</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.node.ref} aria-selected={row.node.ref === selected}>
              <td>
                <button
                  type="button"
                  className={analysis.linkButton}
                  onClick={() => onSelect(row.node.ref)}
                >
                  {row.node.title}
                </button>
                {row.node.seed && (
                  <>
                    {' '}
                    <Badge tone="info" uppercase={false}>
                      seed
                    </Badge>
                  </>
                )}
              </td>
              <td>{row.node.type}</td>
              <td>
                {row.relations.length === 0
                  ? '—'
                  : row.relations.map((entry) => `${entry.type} ${entry.count}`).join(', ')}
              </td>
              <td>{row.time ? utcText(row.time) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The Matrix view: the most connected objects, and the relation types between each pair. */
function GraphMatrixView({
  graph,
  onSelect,
}: {
  graph: ViewGraph;
  onSelect: (ref: string) => void;
}) {
  const colors = useGraphColors();
  const matrix = graphMatrix(graph);
  return (
    <div className={analysis.tableWrap}>
      <table className={`${analysis.table} ${styles.matrix}`} data-testid="graph-matrix">
        <thead>
          <tr>
            <th aria-label="From" />
            {matrix.nodes.map((node, j) => (
              <th key={node.ref} title={node.title} scope="col">
                {j + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.nodes.map((node, i) => (
            <tr key={node.ref}>
              <th scope="row">
                <button
                  type="button"
                  className={analysis.linkButton}
                  onClick={() => onSelect(node.ref)}
                >
                  {i + 1}. {node.title}
                </button>
              </th>
              {matrix.nodes.map((column, j) => {
                const types = matrix.cells.get(`${i}:${j}`);
                const first = types?.[0];
                return (
                  <td
                    key={column.ref}
                    title={types?.join(', ')}
                    data-cell={types ? types.join(',') : undefined}
                    style={
                      first
                        ? {
                            background:
                              colors.families[
                                edgeFamily(first === 'path' ? undefined : (first as RelationType))
                              ],
                          }
                        : undefined
                    }
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {matrix.omitted > 0 && (
        <p className={analysis.muted}>
          The {matrix.nodes.length} most connected objects; {matrix.omitted} more are in the List
          view.
        </p>
      )}
    </div>
  );
}

/** The shared dependencies, each with how many of the objects share it and its weakest label. */
function CommonList({
  common,
  onSelect,
}: {
  common: CommonDependencies;
  onSelect: (ref: string) => void;
}) {
  if (common.dependencies.length === 0) return null;
  return (
    <ul className={analysis.rows} data-testid="common-dependencies">
      {common.dependencies.map((dependency) => (
        <li key={dependency.node.ref} className={styles.commonRow}>
          <button
            type="button"
            className={analysis.linkButton}
            onClick={() => onSelect(dependency.node.ref)}
          >
            {dependency.node.title}
          </button>
          <span className={analysis.muted}>
            {dependency.node.type} · shared by {dependency.sharedBy.length} of {common.refs.length}
          </span>
          <Badge uppercase={false}>{dependency.weakestEdgeLabel}</Badge>
        </li>
      ))}
    </ul>
  );
}
