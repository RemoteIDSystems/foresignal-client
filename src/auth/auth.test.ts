import { HttpResponse } from 'msw';
import { createSessionStore } from '../api/auth';
import { createForesignalClient } from '../api/client';
import { sessionToken } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import type { Session } from '../app/session';
import { signIn, signOut } from './auth';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

/** A session with just the pieces signIn/signOut read: the API client and the session store. */
function fakeSession() {
  const sessions = createSessionStore();
  const api = createForesignalClient({
    baseUrl: MOCK_BASE_URL,
    getToken: () => sessions.get()?.token ?? null,
    retry: false,
  });
  return { api, sessions } as unknown as Session & {
    sessions: ReturnType<typeof createSessionStore>;
  };
}

/** Registers a raw `login` handler that returns the given response. */
function onLogin(respond: () => Response) {
  server.use(http.untyped.post(`${MOCK_BASE_URL}/v1/auth/login`, respond));
}

describe('signIn', () => {
  it('stores the issued session on the happy path', async () => {
    onLogin(() =>
      HttpResponse.json(sessionToken({ token: 'fss_live', expiresAt: '2026-11-01T00:00:00Z' }), {
        status: 200,
      }),
    );
    const session = fakeSession();
    const result = await signIn(session, { email: 'a@b.test', password: 'pw' });
    expect(result).toEqual({ status: 'ok' });
    expect(session.sessions.get()).toEqual({
      token: 'fss_live',
      expiresAt: '2026-11-01T00:00:00Z',
      idleExpiresAt: null,
    });
  });

  it('reports mfa-required (no stored session) when MFA is enrolled and no code was sent', async () => {
    onLogin(() =>
      HttpResponse.json(sessionToken({ token: '', mfaRequired: true, expiresAt: null }), {
        status: 200,
      }),
    );
    const session = fakeSession();
    const result = await signIn(session, { email: 'a@b.test', password: 'pw' });
    expect(result).toEqual({ status: 'mfa-required' });
    expect(session.sessions.get()).toBeNull();
  });

  it('maps INVALID_CREDENTIALS, and names the code on the MFA step', async () => {
    onLogin(() =>
      HttpResponse.json({ title: 'No', status: 401, code: 'INVALID_CREDENTIALS' }, { status: 401 }),
    );
    const session = fakeSession();
    const noCode = await signIn(session, { email: 'a@b.test', password: 'pw' });
    expect(noCode).toEqual({ status: 'error', message: 'Incorrect email or password.' });
    const onCode = await signIn(session, { email: 'a@b.test', password: 'pw', mfaCode: '000000' });
    expect(onCode.status === 'error' && onCode.message).toMatch(/6-digit code/);
  });

  it('maps a suspended account', async () => {
    onLogin(() =>
      HttpResponse.json({ title: 'No', status: 403, code: 'ACCOUNT_DISABLED' }, { status: 403 }),
    );
    const disabled = await signIn(fakeSession(), { email: 'a@b.test', password: 'pw' });
    expect(disabled).toEqual({
      status: 'error',
      message: 'This account is suspended or disabled. Contact your administrator.',
    });
  });

  it('maps a rate limit, with the Retry-After seconds', async () => {
    onLogin(() =>
      HttpResponse.json(
        { title: 'No', status: 429, code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    );
    const limited = await signIn(fakeSession(), { email: 'a@b.test', password: 'pw' });
    expect(limited).toEqual({
      status: 'error',
      message: 'Too many attempts. Try again in 30 seconds.',
    });
  });
});

describe('signOut', () => {
  it('posts logout, then clears the local session', async () => {
    let calledLogout = false;
    server.use(
      http.post('/v1/auth/logout', ({ response }) => {
        calledLogout = true;
        return response(204).empty();
      }),
    );
    const session = fakeSession();
    session.sessions.set({ token: 'fss_live' });
    await signOut(session);
    expect(calledLogout).toBe(true);
    expect(session.sessions.get()).toBeNull();
  });

  it('clears the local session even when logout fails', async () => {
    server.use(
      http.untyped.post(`${MOCK_BASE_URL}/v1/auth/logout`, () =>
        HttpResponse.text('no', { status: 401 }),
      ),
    );
    const session = fakeSession();
    session.sessions.set({ token: 'fss_live' });
    await signOut(session);
    expect(session.sessions.get()).toBeNull();
  });
});
