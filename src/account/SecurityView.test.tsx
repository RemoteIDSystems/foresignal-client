import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { createSession } from '../app/session';
import {
  apiToken,
  apiTokenCreated,
  contract,
  me,
  systemInfo,
  userSession,
} from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { ONBOARDED_KEY } from '../onboarding/onboarding';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(ONBOARDED_KEY, '1');
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function backend() {
  server.use(
    http.get('/v1/system', ({ response }) => response(200).json(systemInfo())),
    http.get('/v1/contract', ({ response }) => response(200).json(contract())),
    http.put('/v1/tokens/current/device', ({ response }) =>
      response(200).json({
        id: '00000000-0000-4000-8000-000000000001',
        name: 'test',
        scope: 'read',
        tokenPrefix: 'fsr_test',
        createdAt: '2026-10-19T00:00:00Z',
      }),
    ),
    http.get('/v1/me', ({ response }) => response(200).json(me())),
    http.get('/v1/me/preferences', ({ response }) =>
      response(200).json({ timezone: null, locale: null, theme: 'system', ui: {} }),
    ),
  );
}

function signedInSession() {
  const session = createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false });
  session.sessions.set({ token: 'fss_live' });
  return session;
}

describe('SecurityView', () => {
  it('marks the current session, protects it, and revokes another', async () => {
    backend();
    let revokedId: string | undefined;
    server.use(
      http.get('/v1/auth/sessions', ({ response }) =>
        response(200).json({
          items: [
            userSession({ id: 'sess-current', current: true, userAgent: 'This Browser' }),
            userSession({ id: 'sess-other', current: false, userAgent: 'Other Browser' }),
          ],
        }),
      ),
      http.get('/v1/me/tokens', ({ response }) => response(200).json([])),
      http.delete('/v1/auth/sessions/{id}', ({ params, response }) => {
        revokedId = String(params.id);
        return response(204).empty();
      }),
    );

    const user = userEvent.setup();
    render(<App session={signedInSession()} initialPath="/account/security" />);

    const current = (await screen.findByText('This Browser')).closest('li') as HTMLElement;
    expect(within(current).getByText('This session')).toBeInTheDocument();
    expect(within(current).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();

    const other = screen.getByText('Other Browser').closest('li') as HTMLElement;
    await user.click(within(other).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(revokedId).toBe('sess-other'));
  });

  it('requires a confirm before signing out everywhere', async () => {
    backend();
    let hit = false;
    server.use(
      http.get('/v1/auth/sessions', ({ response }) =>
        response(200).json({ items: [userSession({ current: true })] }),
      ),
      http.get('/v1/me/tokens', ({ response }) => response(200).json([])),
      http.delete('/v1/auth/sessions', ({ response }) => {
        hit = true;
        return response(204).empty();
      }),
    );

    const user = userEvent.setup();
    render(<App session={signedInSession()} initialPath="/account/security" />);

    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    expect(hit).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirm sign out everywhere' }));
    await waitFor(() => expect(hit).toBe(true));
  });

  it('creates a token and shows the one-time secret', async () => {
    backend();
    server.use(
      http.get('/v1/auth/sessions', ({ response }) => response(200).json({ items: [] })),
      http.get('/v1/me/tokens', ({ response }) => response(200).json([apiToken()])),
      http.post('/v1/me/tokens', ({ response }) =>
        response(201).json(apiTokenCreated({ token: 'fsr_once_only_secret' })),
      ),
    );

    const user = userEvent.setup();
    render(<App session={signedInSession()} initialPath="/account/security" />);

    await user.type(await screen.findByLabelText('Name'), 'CLI key');
    await user.click(screen.getByRole('button', { name: 'Create token' }));

    const secret = await screen.findByLabelText('New API token secret');
    expect(secret).toHaveValue('fsr_once_only_secret');
    expect(screen.getByText(/shown once/i)).toBeInTheDocument();
  });

  it('sends an anonymous visitor to sign in', async () => {
    backend();
    render(
      <App
        session={createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false })}
        initialPath="/account/security"
      />,
    );
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });
});
