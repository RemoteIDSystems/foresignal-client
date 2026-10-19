import { createRetryingFetch } from './retry';

/** A fetch stub that answers with the given responses in order and records each request. */
function scripted(...responses: Array<() => Response>) {
  const requests: Request[] = [];
  const fetch = (request: Request) => {
    requests.push(request);
    const next = responses[requests.length - 1];
    if (!next) throw new Error('unexpected extra request');
    return Promise.resolve(next());
  };
  return { fetch, requests };
}

const busy = (retryAfter?: string) => () =>
  new Response(null, {
    status: 503,
    headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter },
  });
const ok = () => new Response('{}', { status: 200 });

describe('createRetryingFetch', () => {
  it('retries a GET on 503 after Retry-After seconds', async () => {
    const waits: number[] = [];
    const { fetch, requests } = scripted(busy('1'), ok);
    const retrying = createRetryingFetch(fetch, {
      sleep: (ms) => (waits.push(ms), Promise.resolve()),
    });
    const response = await retrying(new Request('http://x/v1/a'));
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(waits).toEqual([1000]);
  });

  it('stops at maxAttempts and returns the last response', async () => {
    const { fetch, requests } = scripted(busy('1'), busy('1'), busy('1'));
    const retrying = createRetryingFetch(fetch, { sleep: () => Promise.resolve() });
    const response = await retrying(new Request('http://x/v1/a'));
    expect(response.status).toBe(503);
    expect(requests).toHaveLength(3);
  });

  it('does not retry without a Retry-After header', async () => {
    const { fetch, requests } = scripted(busy());
    const response = await createRetryingFetch(fetch)(new Request('http://x/v1/a'));
    expect(response.status).toBe(503);
    expect(requests).toHaveLength(1);
  });

  it('does not retry when Retry-After exceeds maxDelaySeconds', async () => {
    const { fetch, requests } = scripted(busy('120'));
    const retrying = createRetryingFetch(fetch, { maxDelaySeconds: 30 });
    expect((await retrying(new Request('http://x/v1/a'))).status).toBe(503);
    expect(requests).toHaveLength(1);
  });

  it('never retries a non-idempotent method', async () => {
    const { fetch, requests } = scripted(busy('1'));
    const retrying = createRetryingFetch(fetch, { sleep: () => Promise.resolve() });
    const response = await retrying(new Request('http://x/v1/a', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(503);
    expect(requests).toHaveLength(1);
  });

  it('does not retry other statuses', async () => {
    const { fetch, requests } = scripted(() => new Response(null, { status: 500 }));
    expect((await createRetryingFetch(fetch)(new Request('http://x/v1/a'))).status).toBe(500);
    expect(requests).toHaveLength(1);
  });

  it('gives up when the request is aborted during the wait', async () => {
    const { fetch } = scripted(busy('1'), ok);
    const controller = new AbortController();
    const retrying = createRetryingFetch(fetch);
    const pending = retrying(new Request('http://x/v1/a', { signal: controller.signal }));
    controller.abort(new Error('canceled'));
    await expect(pending).rejects.toThrow('canceled');
  });
});
