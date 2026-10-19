import { HttpResponse } from 'msw';
import { createForesignalClient, unwrap } from './client';
import { FsError } from './errors';
import { http, MOCK_BASE_URL, server } from './testing/mock-server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** A client against the mock backend that never actually waits between retries. */
function testClient(token?: string) {
  return createForesignalClient({
    baseUrl: MOCK_BASE_URL,
    getToken: () => token,
    retry: { sleep: () => Promise.resolve() },
  });
}

describe('createForesignalClient', () => {
  it('reads getSystem (GET /v1/system)', async () => {
    server.use(
      http.get('/v1/system', ({ response }) =>
        response(200).json({ version: '1.0.0', startedAt: '2026-10-19T00:00:00Z' }),
      ),
    );
    const system = await unwrap(testClient().GET('/v1/system'));
    expect(system.version).toBe('1.0.0');
    expect(system.startedAt).toBe('2026-10-19T00:00:00Z');
  });

  it('sends Accept always and Authorization only when a token is present', async () => {
    const seen: Array<{ accept: string | null; authorization: string | null }> = [];
    server.use(
      http.get('/v1/system', ({ request, response }) => {
        seen.push({
          accept: request.headers.get('Accept'),
          authorization: request.headers.get('Authorization'),
        });
        return response(200).json({ version: '1.0.0', startedAt: '2026-10-19T00:00:00Z' });
      }),
    );
    await unwrap(testClient().GET('/v1/system'));
    await unwrap(testClient('fsr_abc').GET('/v1/system'));
    expect(seen).toEqual([
      { accept: 'application/json, application/problem+json', authorization: null },
      { accept: 'application/json, application/problem+json', authorization: 'Bearer fsr_abc' },
    ]);
  });

  it('maps a ProblemDetail response to FsError (getContract, 401)', async () => {
    server.use(
      http.get('/v1/contract', ({ response }) =>
        response(401).json(
          {
            type: 'https://foresignal.example/problems/credentials-required',
            title: 'Credentials required',
            status: 401,
            code: 'CREDENTIALS_REQUIRED',
            detail: 'This operation needs a bearer token.',
          },
          { headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    const error = await unwrap(testClient().GET('/v1/contract')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FsError);
    expect(error).toMatchObject({
      status: 401,
      code: 'CREDENTIALS_REQUIRED',
      title: 'Credentials required',
      detail: 'This operation needs a bearer token.',
      retryAfter: undefined,
    });
  });

  it('retries getContract on 429 per Retry-After, then succeeds', async () => {
    let calls = 0;
    server.use(
      http.get('/v1/contract', ({ response }) => {
        calls++;
        if (calls === 1) {
          return response(429).json(
            { title: 'Rate limited', status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 1 },
            { headers: { 'Retry-After': '1', 'Content-Type': 'application/problem+json' } },
          );
        }
        return response(200).json({
          contractVersion: '1',
          objectTypes: [],
          relationTypes: [],
          contextSchemaVersion: 1,
          deepLinkVersion: 1,
        });
      }),
    );
    const contract = await unwrap(testClient().GET('/v1/contract'));
    expect(calls).toBe(2);
    expect(contract.contractVersion).toBe('1');
  });

  it('reports retryAfter on the FsError once retries are exhausted', async () => {
    server.use(
      http.get('/v1/contract', ({ response }) =>
        response(429).json(
          { title: 'Rate limited', status: 429, code: 'RATE_LIMITED' },
          { headers: { 'Retry-After': '2', 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    const error = await unwrap(testClient().GET('/v1/contract')).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 2 });
  });

  it('maps a non-problem failure to FsError from the status alone', async () => {
    server.use(
      http.untyped.get(`${MOCK_BASE_URL}/v1/system`, () =>
        HttpResponse.text('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
      ),
    );
    const error = await unwrap(testClient().GET('/v1/system')).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: undefined, title: 'Bad Gateway' });
  });
});
