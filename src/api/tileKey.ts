import type { ForesignalClient } from './client';
import { unwrap } from './client';
import type { components } from './generated/schema';

/** A request to mint a tile key (the spec's `TileKeyCreate`). */
export type TileKeyRequest = components['schemas']['TileKeyCreate'];

/** A minted tile key with its plaintext value, returned once (the spec's `TileKeyCreated`). */
export type TileKey = components['schemas']['TileKeyCreated'];

/**
 * Mints a read-only `fsk_…` tile key with `createTileKey` (`POST /v1/tile-keys`).
 *
 * The key gives header-less access as `/v1/k/{key}/…` when reads are closed. Minting needs a
 * token with `agent` scope.
 */
export function mintTileKey(client: ForesignalClient, request: TileKeyRequest): Promise<TileKey> {
  return unwrap(client.POST('/v1/tile-keys', { body: request }));
}

/**
 * Rewrites a canonical API URL to its tile-key form: `/v1/…` becomes `/v1/k/{key}/…`.
 *
 * Works on absolute and relative URLs; only the first `/v1/` in the path is rewritten, and a
 * URL that is already keyed, or has no `/v1/` path, is returned unchanged.
 */
export function keyed(url: string, key: string): string {
  const match = /^((?:[a-z][a-z0-9+.-]*:)?\/\/[^/?#]*)?(\/v1\/)(.*)$/i.exec(url);
  if (!match) return url;
  const [, origin = '', , rest = ''] = match;
  if (rest.startsWith('k/')) return url;
  return `${origin}/v1/k/${encodeURIComponent(key)}/${rest}`;
}
