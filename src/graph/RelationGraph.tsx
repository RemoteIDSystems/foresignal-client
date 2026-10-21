import { lazy, Suspense } from 'react';
import { familyArrow, nodeGroup, nodeTypes, relationLegend, type ViewGraph } from './graphView';
import type { GraphColors } from './sigmaGraph';
import { useGraphColors } from './useGraphColors';
import styles from './RelationGraph.module.css';

const RelationGraphCanvas = lazy(() => import('./RelationGraphCanvas'));

/** Props for {@link RelationGraph}. */
export interface RelationGraphProps {
  /** The graph to draw; keep its identity while it does not change, or the layout runs again. */
  graph: ViewGraph;
  /** The selected node's ref. */
  selected?: string;
  /** Text whose matching nodes are kept bright. */
  search: string;
  /** Called with a clicked node's ref, or undefined when the empty stage is clicked. */
  onSelect: (ref: string | undefined) => void;
}

/**
 * The relationship graph (024): a force-directed WebGL graph drawn by sigma, which loads with the
 * first graph on screen, in its own chunk. Its box says how many nodes and edges it draws
 * (`data-nodes`, `data-edges`), and the legends name the backend's object and relation types in
 * the colors and line styles they are drawn in.
 */
export function RelationGraph({ graph, selected, search, onSelect }: RelationGraphProps) {
  const colors = useGraphColors();
  return (
    <div
      className={styles.graph}
      role="img"
      aria-label={`Relationship graph: ${graph.nodes.length} objects, ${graph.edges.length} relations`}
      data-testid="relation-graph"
      data-nodes={graph.nodes.length}
      data-edges={graph.edges.length}
    >
      <Suspense fallback={<span className={styles.loading}>Loading graph…</span>}>
        <RelationGraphCanvas
          graph={graph}
          colors={colors}
          search={search}
          onSelect={onSelect}
          {...(selected !== undefined && { selected })}
        />
      </Suspense>
      <GraphLegend graph={graph} colors={colors} />
    </div>
  );
}

/**
 * The legends at the graph's top left: each object type shown, as a dot in its group's color, and
 * each relation type shown, as a line in its style's color (with an arrow when directed).
 */
export function GraphLegend({ graph, colors }: { graph: ViewGraph; colors: GraphColors }) {
  const types = nodeTypes(graph.nodes);
  const relations = relationLegend(graph.edges);
  if (types.length === 0) return null;
  return (
    <div className={styles.legend} data-testid="graph-legend">
      <ul aria-label="Object types">
        {types.map((type) => (
          <li key={type}>
            <span
              className={styles.dot}
              style={{ background: colors.groups[nodeGroup(type)] }}
              aria-hidden="true"
            />
            {type}
          </li>
        ))}
      </ul>
      {relations.length > 0 && (
        <ul aria-label="Relation types">
          {relations.flatMap(({ family, types: names }) =>
            names.map((name) => (
              <li key={name}>
                <span
                  className={familyArrow(family) ? styles.arrow : styles.line}
                  style={{ color: colors.families[family] }}
                  aria-hidden="true"
                />
                {name}
              </li>
            )),
          )}
        </ul>
      )}
    </div>
  );
}
