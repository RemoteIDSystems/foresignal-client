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
  /** Returns this browser's device id, sent as `Foresignal-Device-Id` on the operations that take it. */
  getDeviceId?: () => string;
  /**
   * Called with the originating request whenever the backend answers `401`. The session layer uses
   * it to drop a session whose bearer was rejected (R2-002); the request's `Authorization` header
   * says which credential was sent.
   */
  onUnauthorized?: (request: Request) => void;
  /**
   * Called with the problem `code` (when the body carried one) whenever the backend answers `403`.
   * The session layer uses it to raise the MFA-enrollment gate on `MFA_ENROLLMENT_REQUIRED` (R2-005)
   * instead of surfacing a raw error. The response body is read from a clone, so the caller still
   * sees the original response.
   */
  onForbidden?: (code: string | undefined, request: Request) => void;
  /** The underlying fetch; defaults to `globalThis.fetch`. */
  fetch?: (request: Request) => Promise<Response>;
}

/**
 * The operations whose spec declares a `Foresignal-Device-Id` header, as `METHOD schemaPath`:
 * the inbox (`listNotifications`, `getNotification`, `markNotificationsRead`,
 * `getNotificationBadge`, `streamNotifications`) and `updatePresence`.
 */
export const DEVICE_ID_OPERATIONS: ReadonlySet<string> = new Set([
  'GET /v1/notifications',
  'GET /v1/notifications/{notificationId}',
  'POST /v1/notifications/read',
  'GET /v1/notifications/badge',
  'GET /v1/notifications/stream',
  'POST /v1/clients/presence',
]);

/** Media types the client accepts: JSON results and RFC 9457 problems. */
const ACCEPT = 'application/json, application/problem+json';

/**
 * Creates the backend API client.
 *
 * Every request gets `Accept` (unless the caller set one) and, when `getToken` returns a token,
 * `Authorization: Bearer <token>`. The operations in {@link DEVICE_ID_OPERATIONS} also get
 * `Foresignal-Device-Id` when `getDeviceId` is given. Idempotent requests are retried per `Retry-After` on `429`
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
    onRequest({ request, schemaPath }) {
      if (!request.headers.has('Accept')) {
        request.headers.set('Accept', ACCEPT);
      }
      const token = options.getToken?.();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      if (options.getDeviceId && DEVICE_ID_OPERATIONS.has(`${request.method} ${schemaPath}`)) {
        request.headers.set('Foresignal-Device-Id', options.getDeviceId());
      }
      return request;
    },
    onResponse({ request, response }) {
      if (response.status === 401) {
        options.onUnauthorized?.(request);
      }
      if (response.status === 403 && options.onForbidden) {
        // Read the problem code from a clone so the original response stays intact for the caller.
        void response
          .clone()
          .text()
          .then((text) => {
            let code: string | undefined;
            try {
              const body = JSON.parse(text) as { code?: unknown };
              if (typeof body.code === 'string') code = body.code;
            } catch {
              // Not a JSON problem body (e.g. an HTML page from a proxy): no code to report.
            }
            options.onForbidden?.(code, request);
          });
      }
      return response;
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
