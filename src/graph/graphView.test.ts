import { darkTokens } from '../app/theme/tokens';
import {
  brightNodes,
  commonViewGraph,
  degrees,
  edgeFamily,
  familyArrow,
  familyColors,
  graphMatrix,
  graphRows,
  groupColors,
  incidentEdges,
  matchesSearch,
  NO_FILTERS,
  nodeGroup,
  nodeSize,
  nodeSources,
  nodeTypes,
  relationLegend,
  toViewGraph,
} from './graphView';
import type { GraphNode } from './graphApi';
import { commonDependencies, graphResult, REFS } from './testing/graphFixtures';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const SEEDS = [REFS.investigation, REFS.quake];

describe('the graph view logic', () => {
  it('colors nodes by their type’s group and edges by their relation’s style', () => {
    expect(nodeGroup('investigation')).toBe('event');
    expect(nodeGroup('facility')).toBe('infrastructure');
    expect(nodeGroup('place')).toBe('location');
    expect(nodeGroup('record')).toBe('source');
    expect(nodeGroup('report')).toBe('document');
    expect(nodeGroup('operator')).toBe('entity');
    expect(nodeGroup('intel-event')).toBe('other');
    expect(groupColors(darkTokens).event).toBe(darkTokens.color.danger);

    expect(edgeFamily('evidence-for')).toBe('supports');
    expect(edgeFamily('evidence-against')).toBe('contradicts');
    expect(edgeFamily('causes')).toBe('causal');
    expect(edgeFamily('depends-on')).toBe('causal');
    expect(edgeFamily('precedes')).toBe('temporal');
    expect(edgeFamily('member-of')).toBe('related');
    expect(edgeFamily(undefined)).toBe('related');
    expect(familyArrow('causal')).toBe(true);
    expect(familyArrow('supports')).toBe(false);
    expect(familyColors(darkTokens).temporal).toBe(darkTokens.color.accent);
  });

  it('keeps every node and edge with no filter, but drops self-loops and retired relations', () => {
    const retired = {
      ...graphResult,
      edges: [
        ...graphResult.edges,
        { ...graphResult.edges[1]!, id: 'rel-old', retiredAt: '2026-10-19T00:00:00Z' },
      ],
    };
    const view = toViewGraph(retired, SEEDS, NO_FILTERS, NOW);
    expect(view.nodes.map((node) => node.ref)).toEqual(graphResult.nodes.map((node) => node.ref));
    expect(view.nodes.filter((node) => node.seed).map((node) => node.ref)).toEqual(SEEDS);
    expect(view.edges.map((edge) => edge.id)).toEqual([
      'rel-1',
      'rel-2',
      'rel-3',
      'rel-4',
      'rel-5',
    ]);
    expect(view.edges[1]).toEqual({
      id: 'rel-2',
      from: REFS.quake,
      to: REFS.outage,
      type: 'causes',
      label: 'likely',
      confidence: 0.6,
    });
  });

  it('filters by type, source and time window, keeping the seeds and the edges between what stays', () => {
    const byType = toViewGraph(graphResult, SEEDS, { types: ['facility'] }, NOW);
    expect(byType.nodes.map((node) => node.ref)).toEqual([
      REFS.investigation,
      REFS.quake,
      REFS.plant,
    ]);
    expect(byType.edges.map((edge) => edge.id)).toEqual(['rel-1']);

    const bySource = toViewGraph(graphResult, SEEDS, { types: [], source: 'pge-outages' }, NOW);
    expect(bySource.nodes.map((node) => node.ref)).toEqual([
      REFS.investigation,
      REFS.quake,
      REFS.outage,
      REFS.report,
    ]);

    // Santa Rosa's time is 2020: outside 90 days. The plant has no time, so any window keeps it.
    const recent = toViewGraph(graphResult, SEEDS, { types: [], days: 90 }, NOW);
    expect(recent.nodes.map((node) => node.ref)).not.toContain(REFS.town);
    expect(recent.nodes.map((node) => node.ref)).toContain(REFS.plant);
  });

  it('draws common dependencies as paths from each object to what it shares', () => {
    const known = new Map(graphResult.nodes.map((node): [string, GraphNode] => [node.ref, node]));
    const view = commonViewGraph(commonDependencies, known);
    expect(view.nodes.map((node) => [node.ref, node.seed])).toEqual([
      [REFS.quake, true],
      [REFS.outage, true],
      [REFS.plant, false],
    ]);
    expect(view.nodes[0]?.title).toBe('M 4.6 - 10 km NE of The Geysers');
    expect(view.edges.map((edge) => [edge.from, edge.to, edge.type, edge.label])).toEqual([
      [REFS.quake, REFS.outage, 'causes', 'likely'],
      [REFS.outage, REFS.plant, 'depends-on', 'likely'],
    ]);

    // A ref the graph has not read is named by itself and typed by its prefix.
    const unknown = commonViewGraph(commonDependencies, new Map());
    expect(unknown.nodes[1]).toMatchObject({ title: REFS.outage, type: 'intel-event' });
  });

  it('sizes nodes by their edges, seeds larger, and lists types, sources and the relation legend', () => {
    const view = toViewGraph(graphResult, SEEDS, NO_FILTERS, NOW);
    expect(degrees(view).get(REFS.outage)).toBe(3);
    expect(nodeSize(0, false)).toBe(4);
    expect(nodeSize(4, true)).toBe(12);
    expect(nodeSize(100, false)).toBe(16);
    expect(nodeTypes(graphResult.nodes)).toEqual([
      'facility',
      'intel-event',
      'investigation',
      'place',
      'record',
      'report',
    ]);
    expect(nodeSources(graphResult.nodes)).toEqual([
      'eia-plants',
      'pge-outages',
      'usgs-earthquakes',
    ]);
    expect(relationLegend(view.edges)).toEqual([
      { family: 'supports', types: ['evidence-for'] },
      { family: 'related', types: ['located-in', 'member-of'] },
      { family: 'causal', types: ['causes', 'depends-on'] },
    ]);
  });

  it('searches titles, types and refs, and keeps the selection’s neighbors and the matches bright', () => {
    const view = toViewGraph(graphResult, SEEDS, NO_FILTERS, NOW);
    const outage = view.nodes.find((node) => node.ref === REFS.outage)!;
    expect(matchesSearch(outage, 'santa')).toBe(true);
    expect(matchesSearch(outage, 'INTEL-EVENT')).toBe(true);
    expect(matchesSearch(outage, '  ')).toBe(false);
    expect(brightNodes(view, undefined, '')).toBeUndefined();
    expect([...brightNodes(view, REFS.outage, '')!].sort()).toEqual(
      [REFS.outage, REFS.quake, REFS.plant, REFS.report].sort(),
    );
    expect([...brightNodes(view, undefined, 'santa rosa')!].sort()).toEqual(
      [REFS.outage, REFS.town].sort(),
    );
  });

  it('lists the most connected first, with the relation types at each', () => {
    const rows = graphRows(toViewGraph(graphResult, SEEDS, NO_FILTERS, NOW));
    expect(rows[0]?.node.ref).toBe(REFS.outage);
    expect(rows[0]?.degree).toBe(3);
    expect(rows[0]?.relations).toEqual([
      { type: 'causes', count: 1 },
      { type: 'depends-on', count: 1 },
      { type: 'evidence-for', count: 1 },
    ]);
    expect(rows.find((row) => row.node.ref === REFS.quake)?.time).toBe('2026-10-18T14:12:00Z');
  });

  it('tabulates the relations between the most connected nodes', () => {
    const view = toViewGraph(graphResult, SEEDS, NO_FILTERS, NOW);
    const matrix = graphMatrix(view);
    expect(matrix.nodes).toHaveLength(6);
    expect(matrix.omitted).toBe(0);
    const from = matrix.nodes.findIndex((node) => node.ref === REFS.quake);
    const to = matrix.nodes.findIndex((node) => node.ref === REFS.outage);
    expect(matrix.cells.get(`${from}:${to}`)).toEqual(['causes']);
    expect(matrix.cells.get(`${to}:${from}`)).toBeUndefined();
  });

  it('lists the edges at a node, the most confident first, with the object at the other end', () => {
    const view = toViewGraph(graphResult, SEEDS, NO_FILTERS, NOW);
    const incidents = incidentEdges(view, REFS.outage);
    expect(incidents.map((incident) => [incident.edge.id, incident.direction])).toEqual([
      ['rel-3', 'out'],
      ['rel-5', 'in'],
      ['rel-2', 'in'],
    ]);
    expect(incidents[0]?.other?.title).toBe('Geysers Geothermal Plant');
  });
});
