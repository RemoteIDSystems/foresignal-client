import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths } from './generated/schema';
import { toFsError } from './errors';
import { createRetryingFetch, type RetryOptions } from './retry';

/** A typed client for every operation in `openapi/OpenAPI.json`. */
export type ForesignalClient = Client<paths>;

/** Settings for {@link createForesignalClient}. */
export interface ForesignalClientOptions {
  /** Backend base URL; `/` (or empty) means same-origin. */
  baseUrl: string;
  /** Returns the bearer token to send, or nothing for open reads. Called on every request. */
  getToken?: () => string | null | undefined;
  /** Retry settings for idempotent requests, or `false` to disable retrying. */
  retry?: RetryOptions | false;
  /** The underlying fetch; defaults to `globalThis.fetch`. */
  fetch?: (request: Request) => Promise<Response>;
}

/** Media types the client accepts: JSON results and RFC 9457 problems. */
const ACCEPT = 'application/json, application/problem+json';

/**
 * Creates the backend API client.
 *
 * Every request gets `Accept` (unless the caller set one) and, when `getToken` returns a token,
 * `Authorization: Bearer <token>`. Idempotent requests are retried per `Retry-After` on `429`
 * and `503`. Failed responses are left as openapi-fetch reports them; use {@link unwrap} to turn
 * them into an {@link FsError}.
 */
export function createForesignalClient(options: ForesignalClientOptions): ForesignalClient {
  const baseFetch = options.fetch ?? ((request: Request) => globalThis.fetch(request));
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    fetch: options.retry === false ? baseFetch : createRetryingFetch(baseFetch, options.retry),
  });

  const headers: Middleware = {
    onRequest({ request }) {
      if (!request.headers.has('Accept')) {
        request.headers.set('Accept', ACCEPT);
      }
      const token = options.getToken?.();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    },
  };
  client.use(headers);
  return client;
}

/**
 * Returns the data of an openapi-fetch result, or throws an {@link FsError} for a failed one.
 *
 * ```ts
 * const system = await unwrap(client.GET('/v1/system'));
 * ```
 */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok) {
    throw toFsError(response, error);
  }
  return data as T;
}
