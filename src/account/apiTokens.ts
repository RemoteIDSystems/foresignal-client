import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/**
 * A personal API token of the calling user (`listMyTokens`, `GET /v1/me/tokens`). It carries only
 * the `tokenPrefix` — never the secret, which is returned once at creation ({@link ApiTokenCreated})
 * and never again.
 */
export type ApiToken = components['schemas']['ApiToken'];

/** The body to mint a personal token (`createMyToken`): a `name`, a `scope`, and an optional expiry. */
export type ApiTokenInput = components['schemas']['ApiTokenInput'];

/** A freshly minted token: an {@link ApiToken} plus its one-time `token` secret. */
export type ApiTokenCreated = components['schemas']['ApiTokenCreated'];

/** The scopes a personal token may be minted with. */
export type TokenScope = ApiTokenInput['scope'];

/** The scopes in the order the create form offers them. */
export const TOKEN_SCOPES: readonly TokenScope[] = ['read', 'agent', 'admin'];

/** Lists the calling user's personal API tokens. */
export function listMyTokens(api: ForesignalClient, signal?: AbortSignal): Promise<ApiToken[]> {
  return unwrap(api.GET('/v1/me/tokens', { signal }));
}

/** Mints a personal API token and returns it with its one-time secret. */
export function createMyToken(
  api: ForesignalClient,
  body: ApiTokenInput,
): Promise<ApiTokenCreated> {
  return unwrap(api.POST('/v1/me/tokens', { body }));
}

/** Revokes one personal token by id. */
export async function revokeMyToken(api: ForesignalClient, id: string): Promise<void> {
  await unwrap(api.DELETE('/v1/me/tokens/{id}', { params: { path: { id } } }));
}
