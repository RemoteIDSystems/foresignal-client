import type { ThemeTokens } from '../app/theme';
import type {
  CommonDependencies,
  GraphNode,
  GraphResult,
  Relation,
  RelationType,
} from './graphApi';

/**
 * The color groups nodes are drawn in, after the Analyst Workbench mock's legend. They color the
 * graph only; every label shows the backend's own type.
 */
export type NodeGroup =
  'event' | 'entity' | 'location' | 'infrastructure' | 'source' | 'document' | 'other';

/** The edge styles, after the mock's edge legend; labels show the backend's relation type. */
export type EdgeFamily =
  'supports' | 'contradicts' | 'related' | 'causal' | 'temporal' | 'ownership';

const GROUP_TYPES: Readonly<Record<Exclude<NodeGroup, 'other'>, readonly string[]>> = {
  event: [
    'event',
    'situation',
    'investigation',
    'finding',
    'alert',
    'anomaly',
    'incident',
    'conflict',
    'disaster',
    'seismic',
  ],
  entity: [
    'entity',
    'group',
    'operator',
    'principal',
    'organization',
    'person',
    'actor',
    'forecaster',
    'vessel',
    'aircraft',
  ],
  location: ['place', 'region', 'area', 'location', 'country', 'aoi'],
  infrastructure: ['facility', 'infrastructure', 'asset', 'sensor', 'station', 'satellite'],
  source: ['record', 'series', 'rollup', 'source', 'dataset', 'observation', 'product', 'social'],
  document: [
    'report',
    'document',
    'evidence-item',
    'attachment',
    'assessment',
    'briefing',
    'note',
    'annotation',
    'hypothesis-set',
    'indicator',
    'forecast',
    'question',
  ],
};

/** The color group of a backend object type; a type the client does not know is `other`. */
export function nodeGroup(type: string): NodeGroup {
  for (const [group, types] of Object.entries(GROUP_TYPES)) {
    if (types.includes(type)) return group as NodeGroup;
  }
  return 'other';
}

/** The colors of the node groups, from the theme, in the mock's hues. */
export function groupColors(tokens: ThemeTokens): Readonly<Record<NodeGroup, string>> {
  return {
    event: tokens.color.danger,
    entity: tokens.color.accent,
    location: tokens.tone.tealFg,
    infrastructure: tokens.tone.orangeFg,
    source: tokens.tone.violetFg,
    document: tokens.tone.warningFg,
    other: tokens.color.textSecondary,
  };
}

/** The edge style of a backend relation type. */
export function edgeFamily(type: RelationType | undefined): EdgeFamily {
  switch (type) {
    case 'evidence-for':
      return 'supports';
    case 'evidence-against':
      return 'contradicts';
    case 'causes':
    case 'depends-on':
    case 'affects':
    case 'derived-from':
      return 'causal';
    case 'precedes':
      return 'temporal';
    case 'owns':
    case 'controls':
    case 'officer-of':
    case 'beneficial-owner':
    case 'affiliated-with':
      return 'ownership';
    default:
      // Any unlisted (x-extensible-enum) wire type draws as a generic related edge, not dropped.
      return 'related';
  }
}

/** Whether an edge style is drawn with an arrow head (it has a direction that matters). */
export function familyArrow(family: EdgeFamily): boolean {
  return family === 'causal' || family === 'temporal' || family === 'ownership';
}

/** The colors of the edge styles, from the theme, in the mock's hues. */
export function familyColors(tokens: ThemeTokens): Readonly<Record<EdgeFamily, string>> {
  return {
    supports: tokens.tone.warningFg,
    contradicts: tokens.color.danger,
    related: tokens.color.success,
    causal: tokens.color.textSecondary,
    temporal: tokens.color.accent,
    ownership: tokens.tone.violetFg,
  };
}

/** A node as the graph views draw it. */
export interface ViewNode {
  ref: string;
  /** The backend's object type. */
  type: string;
  title: string;
  /** One of the refs the graph was asked around. */
  seed: boolean;
  /** Its envelope, when the backend sent one. */
  envelope?: GraphNode;
}

/** An edge as the graph views draw it. */
export interface ViewEdge {
  id: string;
  from: string;
  to: string;
  /** The backend's relation type, when known. */
  type?: RelationType;
  /** The backend's label: `confirmed`, `likely`, `possible` or `speculative`. */
  label?: Relation['label'];
  confidence?: number;
  /**
   * Whether the backend materialized the relation (`projected`) and it cannot be retired by hand;
   * false for an operator or agent relation, which `deleteRelation` may retire.
   */
  projected?: boolean;
}

/** A graph ready to draw, list or tabulate. */
export interface ViewGraph {
  nodes: ViewNode[];
  edges: ViewEdge[];
}

/** The client-side filters: node types, a source, a time window and a search. */
export interface GraphFilters {
  /** Backend object types to show; empty shows every type. */
  types: readonly string[];
  /** A source id a node must name in its provenance; undefined shows every source. */
  source?: string;
  /** Show only nodes whose time falls in the last so many days; undefined shows all. */
  days?: number;
}

/** No filter. */
export const NO_FILTERS: GraphFilters = { types: [] };

/** When a node happened, for the time window: its observation, else its start. */
export function nodeTime(node: GraphNode): string | undefined {
  return node.time?.observedAt ?? node.time?.end ?? node.time?.start ?? undefined;
}

/** Whether a node passes the filters. A node with no time passes any window; a seed always passes. */
function passes(node: GraphNode, seed: boolean, filters: GraphFilters, now: number): boolean {
  if (seed) return true;
  if (filters.types.length > 0 && !filters.types.includes(node.type)) return false;
  if (filters.source && !(node.provenance?.sourceIds ?? []).includes(filters.source)) return false;
  if (filters.days !== undefined) {
    const at = nodeTime(node);
    if (at && Date.parse(at) < now - filters.days * 86_400_000) return false;
  }
  return true;
}

/**
 * The subgraph to draw: the nodes that pass the filters (seeds always do) and the edges between
 * them, without self-loops or retired relations.
 */
export function toViewGraph(
  result: GraphResult,
  seeds: readonly string[],
  filters: GraphFilters,
  now: number,
): ViewGraph {
  const seedSet = new Set(seeds);
  const nodes: ViewNode[] = [];
  const shown = new Set<string>();
  for (const node of result.nodes) {
    if (shown.has(node.ref)) continue;
    const seed = seedSet.has(node.ref);
    if (!passes(node, seed, filters, now)) continue;
    shown.add(node.ref);
    nodes.push({ ref: node.ref, type: node.type, title: node.title, seed, envelope: node });
  }
  const edges = result.edges
    .filter(
      (edge) =>
        !edge.retiredAt &&
        edge.fromRef !== edge.toRef &&
        shown.has(edge.fromRef) &&
        shown.has(edge.toRef),
    )
    .map((edge): ViewEdge => ({
      id: edge.id,
      from: edge.fromRef,
      to: edge.toRef,
      // 2.0.0 made the wire relation type `x-extensible-enum` (now `string`); narrow to the
      // closed `RelationType` to keep today's behavior. Tolerating an unlisted type is R2-011's.
      type: edge.type as RelationType,
      label: edge.label,
      confidence: edge.confidence,
      projected: edge.projected,
    }));
  return { nodes, edges };
}

/** The type of a ref (`facility` for `facility:01J…`), for a node the backend sent no envelope of. */
function refType(ref: string): string {
  const colon = ref.indexOf(':');
  return colon > 0 ? ref.slice(0, colon) : ref;
}

/**
 * The common-dependencies graph: the objects asked about, each shared dependency, and every path
 * between them, hop by hop. A path runs from its object through its hops to the dependency; each
 * link takes the relation type at its place when the backend lists one.
 */
export function commonViewGraph(
  common: CommonDependencies,
  known: ReadonlyMap<string, GraphNode>,
): ViewGraph {
  const nodes = new Map<string, ViewNode>();
  const add = (ref: string, seed: boolean, envelope?: GraphNode) => {
    const existing = nodes.get(ref);
    if (existing) {
      existing.seed ||= seed;
      return;
    }
    const node = envelope ?? known.get(ref);
    nodes.set(ref, {
      ref,
      type: node?.type ?? refType(ref),
      title: node?.title ?? ref,
      seed,
      ...(node && { envelope: node }),
    });
  };
  for (const ref of common.refs) add(ref, true);
  const edges = new Map<string, ViewEdge>();
  for (const dependency of common.dependencies) {
    add(dependency.node.ref, false, dependency.node);
    for (const path of dependency.paths) {
      const chain = [path.from, ...path.hops, dependency.node.ref].filter(
        (ref, i, all) => i === 0 || ref !== all[i - 1],
      );
      chain.forEach((ref) => add(ref, common.refs.includes(ref)));
      for (let i = 1; i < chain.length; i++) {
        const from = chain[i - 1] as string;
        const to = chain[i] as string;
        const type = path.relationTypes?.[i - 1];
        const id = `${from}>${to}>${type ?? ''}`;
        if (!edges.has(id)) {
          edges.set(id, {
            id,
            from,
            to,
            // Narrow the now-`string` wire relation type to the closed `RelationType` (see above).
            ...(type && { type: type as RelationType }),
            label: path.weakestEdgeLabel,
          });
        }
      }
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** How many edges touch each node. */
export function degrees(graph: ViewGraph): Map<string, number> {
  const counts = new Map<string, number>(graph.nodes.map((node) => [node.ref, 0]));
  for (const edge of graph.edges) {
    counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
    counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }
  return counts;
}

/** A node's drawn size: larger with more edges, and larger again for a seed. */
export function nodeSize(degree: number, seed: boolean): number {
  return Math.min(16, 4 + 2 * Math.sqrt(degree)) + (seed ? 4 : 0);
}

/** The backend object types among the nodes, sorted, for the type filter and the legend. */
export function nodeTypes(nodes: readonly GraphNode[] | readonly ViewNode[]): string[] {
  return [...new Set(nodes.map((node) => node.type))].sort();
}

/** The source ids the nodes' provenance names, sorted, for the source filter. */
export function nodeSources(nodes: readonly GraphNode[]): string[] {
  return [...new Set(nodes.flatMap((node) => node.provenance?.sourceIds ?? []))].sort();
}

/** The relation types among the edges, grouped by their style, for the edge legend. */
export function relationLegend(
  edges: readonly ViewEdge[],
): { family: EdgeFamily; types: string[] }[] {
  const byFamily = new Map<EdgeFamily, Set<string>>();
  for (const edge of edges) {
    const family = edgeFamily(edge.type);
    const types = byFamily.get(family) ?? new Set<string>();
    types.add(edge.type ?? 'path');
    byFamily.set(family, types);
  }
  const order: EdgeFamily[] = ['supports', 'contradicts', 'related', 'causal', 'temporal'];
  return order
    .filter((family) => byFamily.has(family))
    .map((family) => ({ family, types: [...(byFamily.get(family) ?? [])].sort() }));
}

/** Whether a node matches the search box: its title, type or ref contains the text. */
export function matchesSearch(node: ViewNode, search: string): boolean {
  const text = search.trim().toLowerCase();
  if (!text) return false;
  return (
    node.title.toLowerCase().includes(text) ||
    node.type.toLowerCase().includes(text) ||
    node.ref.toLowerCase().includes(text)
  );
}

/**
 * The nodes kept bright: with a selection, the selected node and its neighbors; with a search, the
 * nodes it matches (both, when both apply). Undefined when nothing is dimmed.
 */
export function brightNodes(
  graph: ViewGraph,
  selected: string | undefined,
  search: string,
): Set<string> | undefined {
  const searching = search.trim() !== '';
  if (selected === undefined && !searching) return undefined;
  const bright = new Set<string>();
  if (selected !== undefined) {
    bright.add(selected);
    for (const edge of graph.edges) {
      if (edge.from === selected) bright.add(edge.to);
      if (edge.to === selected) bright.add(edge.from);
    }
  }
  if (searching) {
    for (const node of graph.nodes) if (matchesSearch(node, search)) bright.add(node.ref);
  }
  return bright;
}

/** A row of the List view. */
export interface GraphRow {
  node: ViewNode;
  degree: number;
  /** The relation types that touch it, with how many of each. */
  relations: { type: string; count: number }[];
  time?: string;
}

/** The List view: every node, the most connected first, then by title. */
export function graphRows(graph: ViewGraph): GraphRow[] {
  const counts = degrees(graph);
  const relations = new Map<string, Map<string, number>>();
  for (const edge of graph.edges) {
    for (const ref of [edge.from, edge.to]) {
      const types = relations.get(ref) ?? new Map<string, number>();
      const key = edge.type ?? 'path';
      types.set(key, (types.get(key) ?? 0) + 1);
      relations.set(ref, types);
    }
  }
  return graph.nodes
    .map((node): GraphRow => {
      const time = node.envelope ? nodeTime(node.envelope) : undefined;
      return {
        node,
        degree: counts.get(node.ref) ?? 0,
        relations: [...(relations.get(node.ref) ?? new Map<string, number>())]
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
        ...(time && { time }),
      };
    })
    .sort((a, b) => b.degree - a.degree || a.node.title.localeCompare(b.node.title));
}

/** The most nodes the Matrix view tabulates. */
export const MATRIX_MAX = 24;

/** The Matrix view: the most connected nodes, and the relation types between each pair. */
export interface GraphMatrix {
  nodes: ViewNode[];
  /** Relation types from the row's node to the column's, by `row:column` index. */
  cells: Map<string, string[]>;
  /** How many nodes were left out. */
  omitted: number;
}

/** The adjacency matrix of the {@link MATRIX_MAX} most connected nodes. */
export function graphMatrix(graph: ViewGraph): GraphMatrix {
  const rows = graphRows(graph).slice(0, MATRIX_MAX);
  const index = new Map(rows.map((row, i) => [row.node.ref, i]));
  const cells = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const from = index.get(edge.from);
    const to = index.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const key = `${from}:${to}`;
    cells.set(key, [...(cells.get(key) ?? []), edge.type ?? 'path']);
  }
  return {
    nodes: rows.map((row) => row.node),
    cells,
    omitted: Math.max(0, graph.nodes.length - rows.length),
  };
}

/** An edge at a node, for the side panel: the relation and the object at its other end. */
export interface Incident {
  edge: ViewEdge;
  other: ViewNode | undefined;
  /** `out` when the node is the relation's subject, `in` when it is the object. */
  direction: 'out' | 'in';
}

/** The edges at a node, the most confident first. */
export function incidentEdges(graph: ViewGraph, ref: string): Incident[] {
  const byRef = new Map(graph.nodes.map((node) => [node.ref, node]));
  return graph.edges
    .filter((edge) => edge.from === ref || edge.to === ref)
    .map((edge): Incident => ({
      edge,
      other: byRef.get(edge.from === ref ? edge.to : edge.from),
      direction: edge.from === ref ? 'out' : 'in',
    }))
    .sort((a, b) => (b.edge.confidence ?? 0) - (a.edge.confidence ?? 0));
}

/** The time windows, in days, as the mock's selector lists them; `undefined` is all time. */
export const GRAPH_WINDOWS: readonly { label: string; days: number | undefined }[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: undefined },
];
