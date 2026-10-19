import type { components } from './generated/schema';

/** An RFC 9457 problem document, as the backend defines it (`components.schemas.Problem`). */
export type Problem = components['schemas']['Problem'];

/**
 * A failed backend call, normalized from the response.
 *
 * Built from the `application/problem+json` body when the backend sends one; otherwise from the
 * HTTP status alone (for example an HTML error page from something in front of the backend).
 */
export class FsError extends Error {
  /** HTTP status of the response. */
  readonly status: number;
  /** The problem's stable machine code (e.g. `RENDER_BUSY`), when the backend sent one. */
  readonly code: string | undefined;
  /** Short human-readable summary of the problem. */
  readonly title: string;
  /** Human-readable explanation specific to this occurrence. */
  readonly detail: string | undefined;
  /** Seconds to wait before retrying, from `Retry-After` or the problem's `retryAfterSeconds`. */
  readonly retryAfter: number | undefined;
  /** The full problem document, when the response carried one. */
  readonly problem: Problem | undefined;

  /** Creates an error from its normalized fields. */
  constructor(fields: {
    status: number;
    code?: string;
    title: string;
    detail?: string;
    retryAfter?: number;
    problem?: Problem;
  }) {
    super(fields.detail ? `${fields.title}: ${fields.detail}` : fields.title);
    this.name = 'FsError';
    this.status = fields.status;
    this.code = fields.code;
    this.title = fields.title;
    this.detail = fields.detail;
    this.retryAfter = fields.retryAfter;
    this.problem = fields.problem;
  }
}

/**
 * Parses a `Retry-After` header value as whole seconds.
 *
 * The backend's spec declares the header as an integer number of seconds; any other form
 * yields `undefined`.
 */
export function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\s*\d+\s*$/.test(value)) {
    return undefined;
  }
  return Number(value.trim());
}

/** Returns true when a parsed body has the required fields of a {@link Problem}. */
export function isProblem(body: unknown): body is Problem {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  return typeof candidate.title === 'string' && typeof candidate.status === 'number';
}

/**
 * Maps a failed response and its parsed body to an {@link FsError}.
 *
 * A problem body supplies `code`, `title` and `detail`; the response status is authoritative for
 * `status`. `retryAfter` prefers the `Retry-After` header and falls back to the problem's
 * `retryAfterSeconds`.
 */
export function toFsError(response: Response, body: unknown): FsError {
  const header = parseRetryAfter(response.headers.get('Retry-After'));
  if (isProblem(body)) {
    return new FsError({
      status: response.status,
      code: body.code,
      title: body.title,
      detail: body.detail,
      retryAfter: header ?? body.retryAfterSeconds ?? undefined,
      problem: body,
    });
  }
  return new FsError({
    status: response.status,
    title: response.statusText || `HTTP ${response.status}`,
    retryAfter: header,
  });
}
