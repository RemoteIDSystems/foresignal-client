import { HttpResponse } from 'msw';
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import type { Session } from '../app/session';
import { activateAccount, requestPasswordReset, resetPassword } from './password';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const session = () =>
  ({ api: createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false }) }) as unknown as Session;

describe('activateAccount', () => {
  it('returns ok on 204', async () => {
    server.use(http.post('/v1/auth/activate', ({ response }) => response(204).empty()));
    expect(await activateAccount(session(), { token: 't', password: 'a'.repeat(12) })).toEqual({
      status: 'ok',
    });
  });

  it('maps an expired/used token (410) to a non-recoverable message', async () => {
    server.use(
      http.untyped.post(`${MOCK_BASE_URL}/v1/auth/activate`, () =>
        HttpResponse.json(
          { title: 'Gone', status: 410, code: 'ACTIVATION_TOKEN_GONE' },
          { status: 410 },
        ),
      ),
    );
    const result = await activateAccount(session(), { token: 't', password: 'a'.repeat(12) });
    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.recoverable).toBe(false);
    expect(result.status === 'error' && result.message).toMatch(/expired or has already been used/);
  });

  it('prefers the backend detail for a weak password (VALIDATION_FAILED)', async () => {
    server.use(
      http.untyped.post(`${MOCK_BASE_URL}/v1/auth/activate`, () =>
        HttpResponse.json(
          {
            title: 'Bad',
            status: 400,
            code: 'VALIDATION_FAILED',
            detail: 'Password is too common.',
          },
          { status: 400 },
        ),
      ),
    );
    const result = await activateAccount(session(), { token: 't', password: 'a'.repeat(12) });
    expect(result).toEqual({
      status: 'error',
      message: 'Password is too common.',
      recoverable: true,
    });
  });
});

describe('resetPassword', () => {
  it('returns ok on 204', async () => {
    server.use(http.post('/v1/auth/password/reset', ({ response }) => response(204).empty()));
    expect(await resetPassword(session(), { token: 't', newPassword: 'a'.repeat(12) })).toEqual({
      status: 'ok',
    });
  });

  it('maps an expired/used reset token (410) to a recoverable message', async () => {
    server.use(
      http.untyped.post(`${MOCK_BASE_URL}/v1/auth/password/reset`, () =>
        HttpResponse.json(
          { title: 'Gone', status: 410, code: 'RESET_TOKEN_GONE' },
          { status: 410 },
        ),
      ),
    );
    const result = await resetPassword(session(), { token: 't', newPassword: 'a'.repeat(12) });
    expect(result.status === 'error' && result.recoverable).toBe(true);
    expect(result.status === 'error' && result.message).toMatch(/Request a new one/);
  });
});

describe('requestPasswordReset', () => {
  it('posts the request and resolves (neutral) on 202', async () => {
    let posted: unknown;
    server.use(
      http.post('/v1/auth/password/reset-request', async ({ request, response }) => {
        posted = await request.json();
        return response(202).empty();
      }),
    );
    await expect(requestPasswordReset(session(), ' a@b.test ')).resolves.toBeUndefined();
    expect(posted).toEqual({ email: 'a@b.test' });
  });

  it('resolves (neutral) even when rate-limited', async () => {
    server.use(
      http.untyped.post(`${MOCK_BASE_URL}/v1/auth/password/reset-request`, () =>
        HttpResponse.json({ title: 'No', status: 429, code: 'RATE_LIMITED' }, { status: 429 }),
      ),
    );
    await expect(requestPasswordReset(session(), 'a@b.test')).resolves.toBeUndefined();
  });
});
