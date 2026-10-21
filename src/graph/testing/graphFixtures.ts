import type { CommonDependencies, GraphNode, GraphResult, Relation } from '../graphApi';

/** The stand-in investigation's id (the same as the intel fixtures'). */
export const GRAPH_INVESTIGATION_ID = '01JA8Q0000000000000000000B';

/** The refs of the stand-in graph's nodes. */
export const REFS = {
  investigation: `investigation:${GRAPH_INVESTIGATION_ID}`,
  quake: 'record:usgs-earthquakes/nc75095651@12',
  outage: 'intel-event:01JA8Q0000000000000000000E',
  plant: 'facility:01JA8Q00000000000000000G01',
  town: 'place:01JA8Q00000000000000000G02',
  report: 'report:01JA8Q00000000000000000G03',
} as const;

/** An envelope with the given ref, type and title, and anything else. */
export function node(ref: string, type: string, title: string, extra: Partial<GraphNode> = {}) {
  return { ref, type, title, ...extra } satisfies GraphNode;
}

/** A relation between two refs, at 2026-10-18, confirmed at 0.9 unless told otherwise. */
export function relation(
  id: string,
  fromRef: string,
  toRef: string,
  type: Relation['type'],
  extra: Partial<Relation> = {},
): Relation {
  return {
    id,
    fromRef,
    toRef,
    type,
    validFrom: '2026-10-18T00:00:00Z',
    confidence: 0.9,
    label: 'confirmed',
    provenance: { component: 'linker', version: '1' },
    projected: true,
    createdAt: '2026-10-18T00:00:00Z',
    ...extra,
  };
}

/** The stand-in subgraph around the investigation and its quake: six objects, six relations. */
export const graphResult: GraphResult = {
  nodes: [
    node(REFS.investigation, 'investigation', 'Tropical Storm Florence', { status: 'active' }),
    node(REFS.quake, 'record', 'M 4.6 - 10 km NE of The Geysers', {
      severity: 'warning',
      summary: 'Strongest of the swarm.',
      time: { start: '2026-10-18T14:12:00Z', observedAt: '2026-10-18T14:12:00Z' },
      provenance: { sourceIds: ['usgs-earthquakes'] },
      tags: ['seismic'],
    }),
    node(REFS.outage, 'intel-event', 'Power outage near Santa Rosa', {
      time: { start: '2026-10-18T15:00:00Z' },
      provenance: { sourceIds: ['pge-outages'] },
    }),
    node(REFS.plant, 'facility', 'Geysers Geothermal Plant', {
      provenance: { sourceIds: ['eia-plants'] },
    }),
    node(REFS.town, 'place', 'Santa Rosa', { time: { start: '2020-01-01T00:00:00Z' } }),
    node(REFS.report, 'report', 'Utility statement', {
      time: { start: '2026-10-19T09:00:00Z' },
      provenance: { sourceIds: ['pge-outages'] },
    }),
  ],
  edges: [
    relation('rel-1', REFS.quake, REFS.investigation, 'member-of'),
    relation('rel-2', REFS.quake, REFS.outage, 'causes', { confidence: 0.6, label: 'likely' }),
    relation('rel-3', REFS.outage, REFS.plant, 'depends-on'),
    relation('rel-4', REFS.plant, REFS.town, 'located-in'),
    relation('rel-5', REFS.report, REFS.outage, 'evidence-for', { confidence: 0.75 }),
    relation('rel-6', REFS.quake, REFS.quake, 'same-as'),
  ],
  missing: [],
  truncated: false,
  asOf: null,
};

/** What the quake and the outage share: the plant, by way of the outage. */
export const commonDependencies: CommonDependencies = {
  refs: [REFS.quake, REFS.outage],
  generatedAt: '2026-10-20T12:00:00Z',
  dependencies: [
    {
      node: graphResult.nodes[3] as GraphNode,
      sharedBy: [REFS.quake, REFS.outage],
      weakestEdgeLabel: 'likely',
      paths: [
        {
          from: REFS.quake,
          hops: [REFS.outage],
          relationTypes: ['causes', 'depends-on'],
          weakestEdgeLabel: 'likely',
        },
        {
          from: REFS.outage,
          hops: [],
          relationTypes: ['depends-on'],
          weakestEdgeLabel: 'confirmed',
        },
      ],
    },
  ],
};
