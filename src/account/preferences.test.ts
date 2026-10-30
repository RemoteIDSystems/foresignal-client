import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpResponse } from 'msw';
import { createForesignalClient } from '../api/client';
import { userPreferences } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { createPreferencesStore, getMyPreferences, updateMyPreferences } from './preferences';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('getMyPreferences / updateMyPreferences', () => {
  it('reads and replaces the calling user preferences', async () => {
    server.use(
      http.get('/v1/me/preferences', ({ response }) =>
        response(200).json(userPreferences({ theme: 'dark', timezone: 'Europe/Paris' })),
      ),
    );
    expect((await getMyPreferences(client())).theme).toBe('dark');

    let sent: unknown;
    server.use(
      http.put('/v1/me/preferences', async ({ request, response }) => {
        sent = await request.json();
        return response(200).json(userPreferences({ theme: 'light' }));
      }),
    );
    const saved = await updateMyPreferences(client(), userPreferences({ theme: 'light' }));
    expect(saved.theme).toBe('light');
    expect(sent).toMatchObject({ theme: 'light' });
  });
});

describe('createPreferencesStore', () => {
  it('loads the preferences and notifies subscribers', async () => {
    server.use(
      http.get('/v1/me/preferences', ({ response }) =>
        response(200).json(userPreferences({ locale: 'en-GB' })),
      ),
    );
    const store = createPreferencesStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get()).toBeNull();
    await store.load(client());
    expect(store.get()?.locale).toBe('en-GB');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reads as null when the call fails', async () => {
    server.use(
      http.untyped.get(`${MOCK_BASE_URL}/v1/me/preferences`, () =>
        HttpResponse.text('forbidden', { status: 403 }),
      ),
    );
    const store = createPreferencesStore();
    await store.load(client());
    expect(store.get()).toBeNull();
  });

  it('set() publishes directly and clear() drops to null', () => {
    const store = createPreferencesStore();
    store.set(userPreferences({ theme: 'light' }));
    expect(store.get()?.theme).toBe('light');
    store.clear();
    expect(store.get()).toBeNull();
  });
});
