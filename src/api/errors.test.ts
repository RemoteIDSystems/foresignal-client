import { FsError, isProblem, parseRetryAfter, toFsError } from './errors';

describe('parseRetryAfter', () => {
  it('reads whole seconds', () => {
    expect(parseRetryAfter('1')).toBe(1);
    expect(parseRetryAfter(' 30 ')).toBe(30);
  });

  it('rejects anything else', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('1.5')).toBeUndefined();
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
  });
});

describe('toFsError', () => {
  it('maps a RENDER_BUSY problem with its Retry-After', () => {
    const response = new Response(null, { status: 503, headers: { 'Retry-After': '1' } });
    const error = toFsError(response, { title: 'Render busy', status: 503, code: 'RENDER_BUSY' });
    expect(error).toBeInstanceOf(FsError);
    expect(error).toMatchObject({ status: 503, code: 'RENDER_BUSY', retryAfter: 1 });
    expect(error.problem?.code).toBe('RENDER_BUSY');
  });

  it('falls back to retryAfterSeconds when the header is absent', () => {
    const response = new Response(null, { status: 429 });
    const error = toFsError(response, { title: 'Slow down', status: 429, retryAfterSeconds: 5 });
    expect(error.retryAfter).toBe(5);
  });

  it('uses the response status even if the problem body disagrees', () => {
    const error = toFsError(new Response(null, { status: 404 }), { title: 'x', status: 500 });
    expect(error.status).toBe(404);
  });

  it('builds a message from title and detail', () => {
    const error = toFsError(new Response(null, { status: 400 }), {
      title: 'Validation failed',
      status: 400,
      detail: 'limit must be positive',
    });
    expect(error.message).toBe('Validation failed: limit must be positive');
  });
});

describe('isProblem', () => {
  it('requires a string title and a numeric status', () => {
    expect(isProblem({ title: 't', status: 400 })).toBe(true);
    expect(isProblem({ title: 't' })).toBe(false);
    expect(isProblem('t')).toBe(false);
    expect(isProblem(null)).toBe(false);
  });
});
