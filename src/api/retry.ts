import { parseRetryAfter } from './errors';

/** Settings for {@link createRetryingFetch}. */
export interface RetryOptions {
  /** Total attempts including the first; default 3. */
  maxAttempts?: number;
  /** The longest `Retry-After` honored, in seconds; a longer wait is not retried. Default 30. */
  maxDelaySeconds?: number;
  /** Waits the given milliseconds; replaceable in tests. Rejects if the signal aborts. */
  sleep?: (ms: number, signal: AbortSignal | null) => Promise<void>;
}

/** HTTP methods that are safe to repeat. */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD']);

/** Statuses the backend answers with `Retry-After` when the request may be repeated. */
const RETRYABLE_STATUSES = new Set([429, 503]);

/** Waits `ms` milliseconds, rejecting early when `signal` aborts. */
function defaultSleep(ms: number, signal: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Wraps a `fetch` so idempotent requests are retried on `429` and `503` per `Retry-After`.
 *
 * Only `GET`/`HEAD` are retried, only when the response carries a whole-seconds `Retry-After`
 * (as the backend sends with `RENDER_BUSY` and `RATE_LIMITED`), only up to `maxAttempts`, and
 * only when the wait is at most `maxDelaySeconds`. Otherwise the response is returned as-is.
 */
export function createRetryingFetch(
  baseFetch: (request: Request) => Promise<Response>,
  options: RetryOptions = {},
): (request: Request) => Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 3;
  const maxDelaySeconds = options.maxDelaySeconds ?? 30;
  const sleep = options.sleep ?? defaultSleep;

  return async (request) => {
    if (!IDEMPOTENT_METHODS.has(request.method.toUpperCase())) {
      return baseFetch(request);
    }
    for (let attempt = 1; ; attempt++) {
      const response = await baseFetch(request.clone());
      if (attempt >= maxAttempts || !RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }
      const wait = parseRetryAfter(response.headers.get('Retry-After'));
      if (wait === undefined || wait > maxDelaySeconds) {
        return response;
      }
      await response.body?.cancel();
      await sleep(wait * 1000, request.signal);
    }
  };
}
