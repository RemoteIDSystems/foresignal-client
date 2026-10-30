import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/** The ownership / affiliation chains from the seeds (`ownershipChain`). */
export type OwnershipChain = components['schemas']['OwnershipChain'];

/** One entity reached through ownership / affiliation edges, with the chains that reached it. */
export type OwnershipChainNode = components['schemas']['OwnershipChainNode'];

/** The body to walk ownership chains (`OwnershipChainRequest`). */
export type OwnershipChainRequest = components['schemas']['OwnershipChainRequest'];

/** Which way the walk follows edges from the seed. */
export type OwnershipDirection = NonNullable<OwnershipChainRequest['direction']>;

/** The ownership / affiliation edge types the walk may follow. */
export type OwnershipEdgeType = NonNullable<OwnershipChainRequest['types']>[number];

/** The most seeds `ownershipChain` takes. */
export const OWNERSHIP_MAX_SEEDS = 50;

/**
 * Walks the ownership / affiliation chains around one or more seed entities (`POST
 * /v1/graph/ownership-chain`, gated `data.read`). `direction` follows what a seed owns (`out`), who
 * owns it (`in`), or both; `depth` caps the hops.
 */
export function ownershipChain(
  api: ForesignalClient,
  refs: readonly string[],
  options: { depth?: number; direction?: OwnershipDirection; asOf?: string } = {},
  signal?: AbortSignal,
): Promise<OwnershipChain> {
  return unwrap(
    api.POST('/v1/graph/ownership-chain', {
      body: {
        refs: refs.slice(0, OWNERSHIP_MAX_SEEDS),
        // The contract's documented defaults (the generated type makes them required).
        depth: options.depth ?? 6,
        direction: options.direction ?? 'both',
        minConfidence: 0,
        ...(options.asOf && { asOf: options.asOf }),
      },
      signal,
    }),
  );
}
