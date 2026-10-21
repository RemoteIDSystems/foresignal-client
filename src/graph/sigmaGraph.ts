import { MultiDirectedGraph } from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import {
  degrees,
  edgeFamily,
  familyArrow,
  nodeGroup,
  nodeSize,
  type EdgeFamily,
  type NodeGroup,
  type ViewGraph,
} from './graphView';

/** What each node of the drawn graph carries. */
export interface NodeAttributes {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  /** The backend's object type (sigma's own `type` names the drawing program). */
  kind: string;
  seed: boolean;
}

/** What each edge of the drawn graph carries. */
export interface EdgeAttributes {
  size: number;
  color: string;
  /** The sigma program: `arrow` for a directed style, `line` otherwise. */
  type: 'arrow' | 'line';
  /** The backend's relation type. */
  relation?: string;
}

/** The drawn graph. */
export type DrawnGraph = MultiDirectedGraph<NodeAttributes, EdgeAttributes>;

/** The colors the graph is drawn in. */
export interface GraphColors {
  groups: Readonly<Record<NodeGroup, string>>;
  families: Readonly<Record<EdgeFamily, string>>;
}

/** Above this many nodes, the synchronous layout runs fewer passes and the worker refines it. */
export const LARGE_GRAPH = 300;

/**
 * The graph as sigma draws it: each node sized by its edges and colored by its type's group, placed
 * on a circle (seeds on an inner one) for the layout to start from; each edge colored by its
 * relation type's style, with an arrow for causal and temporal ones.
 */
export function buildDrawnGraph(view: ViewGraph, colors: GraphColors): DrawnGraph {
  const graph: DrawnGraph = new MultiDirectedGraph();
  const counts = degrees(view);
  const seeds = view.nodes.filter((node) => node.seed);
  const others = view.nodes.filter((node) => !node.seed);
  const place = (list: typeof view.nodes, radius: number) =>
    list.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, list.length);
      graph.addNode(node.ref, {
        x: list.length === 1 && radius < 50 ? 0 : radius * Math.cos(angle),
        y: list.length === 1 && radius < 50 ? 0 : radius * Math.sin(angle),
        size: nodeSize(counts.get(node.ref) ?? 0, node.seed),
        color: colors.groups[nodeGroup(node.type)],
        label: node.title,
        kind: node.type,
        seed: node.seed,
      });
    });
  place(seeds, 10);
  place(others, 100);
  for (const edge of view.edges) {
    if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to) || graph.hasEdge(edge.id)) continue;
    const family = edgeFamily(edge.type);
    graph.addDirectedEdgeWithKey(edge.id, edge.from, edge.to, {
      size: 1 + (edge.confidence ?? 0.5) * 1.5,
      color: colors.families[family],
      type: familyArrow(family) ? 'arrow' : 'line',
      ...(edge.type && { relation: edge.type }),
    });
  }
  return graph;
}

/**
 * Lays the graph out with ForceAtlas2, in place: many passes for a small graph, few for a large
 * one (which the canvas then refines in a worker, so the page stays interactive).
 */
export function layoutGraph(graph: DrawnGraph): void {
  if (graph.order < 2) return;
  const large = graph.order > LARGE_GRAPH;
  forceAtlas2.assign(graph, {
    iterations: large ? 30 : 200,
    settings: { ...forceAtlas2.inferSettings(graph), barnesHutOptimize: large },
  });
}
