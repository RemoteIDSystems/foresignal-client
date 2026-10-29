import { HttpResponse } from 'msw';
import { createSessionStore, createTokenStore } from './auth';
import { createForesignalClient } from './client';
import { createPrincipalStore } from './me';
import { me } from './testing/fixtures';
import { http, MOCK_BASE_URL, server } from './testing/mock-server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = (options: Partial<Parameters<typeof createForesignalClient>[0]> = {}) =>
  createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false, ...options });

describe('createPrincipalStore', () => {
  it('loads getMe into the signed-in principal', async () => {
    server.use(
      http.get('/v1/me', ({ response }) =>
        response(200).json(me({ permissions: ['intel.read'], scopes: ['read'] })),
      ),
    );
    const store = createPrincipalStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get()).toBeNull();
    await store.load(client());
    expect(store.get()?.permissions).toEqual(['intel.read']);
    expect(store.get()?.scopes).toEqual(['read']);
    expect(store.get()?.principal.handle).toBe('analyst');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reads as anonymous (null) when getMe fails', async () => {
    server.use(
      http.untyped.get(`${MOCK_BASE_URL}/v1/me`, () =>
        HttpResponse.text('unauthorized', { status: 401 }),
      ),
    );
    const store = createPrincipalStore();
    await store.load(client());
    expect(store.get()).toBeNull();
  });

  it('clear() drops the principal and supersedes an in-flight load', async () => {
    server.use(http.get('/v1/me', ({ response }) => response(200).json(me())));
    const store = createPrincipalStore();
    const loading = store.load(client());
    store.clear();
    await loading;
    expect(store.get()).toBeNull();
  });
});

describe('session credential selection and 401 handling', () => {
  /** The bearer getter and 401 handler createSession wires, built here over real stores. */
  function wiring() {
    const tokens = createTokenStore();
    const sessions = createSessionStore();
    const getBearer = () => sessions.get()?.token ?? tokens.get();
    const onUnauthorized = (request: Request) => {
      const current = sessions.get();
      if (current && request.headers.get('Authorization') === `Bearer ${current.token}`) {
        sessions.clear();
      }
    };
    return { tokens, sessions, getBearer, onUnauthorized };
  }

  it('prefers the session bearer over a pasted API token', async () => {
    const { tokens, sessions, getBearer, onUnauthorized } = wiring();
    tokens.set('fsr_api');
    sessions.set({ token: 'fss_live' });
    let seen: string | null = null;
    server.use(
      http.get('/v1/me', ({ request, response }) => {
        seen = request.headers.get('Authorization');
        return response(200).json(me());
      }),
    );
    await client({ getToken: getBearer, onUnauthorized }).GET('/v1/me');
    expect(seen).toBe('Bearer fss_live');
  });

  it('clears the session on a 401 made with it, leaving a pasted API token intact', async () => {
    const { tokens, sessions, getBearer, onUnauthorized } = wiring();
    tokens.set('fsr_api');
    sessions.set({ token: 'fss_live' });
    server.use(
      http.untyped.get(`${MOCK_BASE_URL}/v1/me`, () =>
        HttpResponse.text('unauthorized', { status: 401 }),
      ),
    );
    await client({ getToken: getBearer, onUnauthorized }).GET('/v1/me');
    expect(sessions.get()).toBeNull();
    expect(tokens.get()).toBe('fsr_api');
  });

  it('falls back to the API token once the session is gone, and that still authenticates', async () => {
    const { tokens, sessions, getBearer, onUnauthorized } = wiring();
    tokens.set('fsr_api');
    expect(sessions.get()).toBeNull();
    let seen: string | null = null;
    server.use(
      http.get('/v1/me', ({ request, response }) => {
        seen = request.headers.get('Authorization');
        return response(200).json(me());
      }),
    );
    await client({ getToken: getBearer, onUnauthorized }).GET('/v1/me');
    expect(seen).toBe('Bearer fsr_api');
  });

  it('does not clear the session on a 401 made with a different credential', async () => {
    const { tokens, sessions, onUnauthorized } = wiring();
    sessions.set({ token: 'fss_live' });
    tokens.set('fsr_api');
    // A 401 whose request carried the API token (not the session) leaves the session alone.
    server.use(
      http.untyped.get(`${MOCK_BASE_URL}/v1/me`, () =>
        HttpResponse.text('unauthorized', { status: 401 }),
      ),
    );
    await client({
      getToken: () => tokens.get(),
      onUnauthorized,
    }).GET('/v1/me');
    expect(sessions.get()).toEqual({ token: 'fss_live' });
  });
});
