import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { App } from '../app/App';
import { createSession } from '../app/session';
import { contract, me, systemInfo } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { ONBOARDED_KEY } from '../onboarding/onboarding';
import type { EditionSummary } from './editionsApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(ONBOARDED_KEY, '1');
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BRIEFING_ID = '00000000-0000-4000-8000-000000000001';

function edition(overrides: Partial<EditionSummary> = {}): EditionSummary {
  return {
    briefingId: BRIEFING_ID,
    name: 'Morning Brief',
    enabled: true,
    schedule: '0 7 * * *',
    timezone: 'UTC',
    outputLanguage: 'en',
    ...overrides,
  };
}

/** The capability + identity calls every rendered screen needs, with the given permissions. */
function backend(permissions: string[], items: EditionSummary[] = []) {
  server.use(
    http.get('/v1/system', ({ response }) => response(200).json(systemInfo())),
    http.get('/v1/contract', ({ response }) => response(200).json(contract())),
    http.put('/v1/tokens/current/device', ({ response }) =>
      response(200).json({
        id: BRIEFING_ID,
        name: 'test',
        scope: 'read',
        tokenPrefix: 'fsr_test',
        createdAt: '2026-10-19T00:00:00Z',
      }),
    ),
    http.get('/v1/me', ({ response }) => response(200).json(me({ permissions }))),
    http.get('/v1/me/preferences', ({ response }) =>
      response(200).json({ timezone: null, locale: null, theme: 'system', ui: {} }),
    ),
    http.get('/v1/me/editions', ({ response }) => response(200).json({ items, nextCursor: null })),
    // The reader the editor navigates to after a save; a 404 keeps it a clean error state.
    http.get('/v1/briefings/{briefingId}/runs/latest', ({ response }) =>
      response(404).json({ type: 'about:blank', title: 'No run', status: 404 }),
    ),
    http.untyped.get(`${MOCK_BASE_URL}/v1/briefings/:briefingId/podcast.rss`, () =>
      HttpResponse.text('<rss></rss>', { headers: { 'Content-Type': 'application/rss+xml' } }),
    ),
    http.get('/v1/editions/{briefingId}/site', ({ response }) =>
      response(404).json({ type: 'about:blank', title: 'No site', status: 404 }),
    ),
  );
}

function signedInSession() {
  const session = createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false });
  session.sessions.set({ token: 'fss_live' });
  return session;
}

describe('EditionEditor', () => {
  it('creates an edition, sending the input without an ownerUserId', async () => {
    backend(['self.editions']);
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.post('/v1/me/editions', async ({ request, response }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return response(201).json({
          id: BRIEFING_ID,
          createdAt: '2026-10-30T07:00:00Z',
          name: sent.name as string,
          schedule: '0 8 * * *',
          enabled: true,
          timezone: 'UTC',
          mode: 'digest',
          maxItemsPerKind: 5,
          includeProvenance: false,
          includeCorroboration: false,
        });
      }),
    );

    const user = userEvent.setup();
    render(<App session={signedInSession()} initialPath="/editions/new" />);

    const name = await screen.findByLabelText('Name');
    await user.type(name, 'My Paper');
    await user.click(screen.getByRole('button', { name: 'Create edition' }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent?.name).toBe('My Paper');
    expect(sent?.schedule).toBe('0 7 * * *');
    expect(sent).not.toHaveProperty('ownerUserId');
  });

  it('prefills the edit form from the user’s edition summary', async () => {
    backend(['self.editions'], [edition({ name: 'Evening Brief', outputLanguage: 'es' })]);
    render(<App session={signedInSession()} initialPath={`/editions/${BRIEFING_ID}/edit`} />);

    const name = await screen.findByLabelText<HTMLInputElement>('Name');
    expect(name.value).toBe('Evening Brief');
    expect(screen.getByLabelText<HTMLInputElement>('Output language (BCP 47)').value).toBe('es');
    // PUT replaces the full configuration, so the editor warns before saving.
    expect(screen.getByText(/Saving replaces this edition/)).toBeInTheDocument();
  });

  it('keeps a user without self.editions on a read-only path', async () => {
    backend(['data.read']);
    render(<App session={signedInSession()} initialPath="/editions/new" />);
    expect(
      await screen.findByText(/Your role does not include building editions/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create edition' })).not.toBeInTheDocument();
  });

  it('offers an anonymous visitor a way to sign in', async () => {
    backend(['self.editions']);
    render(
      <App
        session={createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false })}
        initialPath="/editions/new"
      />,
    );
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });
});
