import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** A subgraph query from seed refs (`GraphRequest`). */
export type GraphRequest = components['schemas']['GraphRequest'];

/** A subgraph query as the client asks it: the depth and edge limit have defaults. */
export type GraphQuery = Omit<GraphRequest, 'depth' | 'limit' | 'refs'> & {
  refs: readonly string[];
  depth?: 1 | 2;
  limit?: number;
};

/** Nodes (envelopes) and edges around seed refs (`GraphResult`). */
export type GraphResult = components['schemas']['GraphResult'];

/** One node of a subgraph: an object's envelope. */
export type GraphNode = GraphResult['nodes'][number];

/** A time- and provenance-aware edge between two objects (`Relation`). */
export type Relation = components['schemas']['Relation'];

/**
 * A relation's type, as the backend names it (`member-of`, `evidence-for`, …).
 *
 * In 2.0.0 the backend marked `Relation.type` `x-extensible-enum`, which `openapi-typescript`
 * renders as a bare `string` — so this is no longer derived from `Relation['type']` (that is now
 * `string` and would lose the closed union `RELATION_TYPES`, `edgeFamily` and the graph filter
 * depend on). It is instead the still-closed filter enum `GraphRequest.types` carries (the 20
 * values a `POST /v1/graph` query may ask for). Gracefully handling an unlisted wire relation type
 * that the server may now return is R2-011's job.
 */
export type RelationType = NonNullable<GraphRequest['types']>[number];

/** Facilities and infrastructure that objects share (`CommonDependencies`). */
export type CommonDependencies = components['schemas']['CommonDependencies'];

/** One shared dependency, with the objects that share it and their paths to it. */
export type CommonDependency = CommonDependencies['dependencies'][number];

/** Every relation type the backend defines, in the OpenAPI's order. */
export const RELATION_TYPES: readonly RelationType[] = [
  'member-of',
  'observed-by',
  'same-as',
  'located-in',
  'near',
  'depends-on',
  'affects',
  'derived-from',
  'evidence-for',
  'evidence-against',
  'about',
  'mentions',
  'precedes',
  'causes',
  'related-to',
  // Ownership / affiliation edges (R2-011): surfaced in the relation filter and legend.
  'owns',
  'controls',
  'officer-of',
  'beneficial-owner',
  'affiliated-with',
];

/** The most edges `queryGraph` returns; the client asks for all of them. */
export const GRAPH_MAX_EDGES = 2000;

/** The most seed refs `queryGraph` takes. */
export const GRAPH_MAX_SEEDS = 50;

/** The most refs `findCommonDependencies` takes. */
export const COMMON_MAX_REFS = 20;

/**
 * The subgraph within `depth` (1 by default, or 2) of up to 50 seed refs (`queryGraph`),
 * optionally only some relation types, valid at an instant, above a confidence, and up to `limit`
 * edges ({@link GRAPH_MAX_EDGES} by default, the backend's most).
 */
export function queryGraph(
  api: ForesignalClient,
  query: GraphQuery,
  signal?: AbortSignal,
): Promise<GraphResult> {
  return unwrap(
    api.POST('/v1/graph', {
      body: {
        ...query,
        refs: query.refs.slice(0, GRAPH_MAX_SEEDS),
        depth: query.depth ?? 1,
        limit: query.limit ?? GRAPH_MAX_EDGES,
      },
      signal,
    }),
  );
}

/**
 * The facilities and infrastructure that 2 to 20 objects share through `depends-on` and
 * `located-in` paths (`findCommonDependencies`), each with its weakest edge's label.
 */
export function findCommonDependencies(
  api: ForesignalClient,
  refs: readonly string[],
  asOf?: string,
  signal?: AbortSignal,
): Promise<CommonDependencies> {
  return unwrap(
    api.POST('/v1/graph/common-dependencies', {
      body: { refs: refs.slice(0, COMMON_MAX_REFS), ...(asOf && { asOf }) },
      signal,
    }),
  );
}
