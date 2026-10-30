import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { createSession } from '../app/session';
import {
  contract,
  me,
  notificationPreference,
  systemInfo,
  userPreferences,
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

/** Serves the capability and device calls every session makes on startup. */
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
  );
}

/** A session already signed in with a login session credential. */
function signedInSession() {
  const session = createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false });
  session.sessions.set({ token: 'fss_live' });
  return session;
}

describe('AccountView', () => {
  it('shows the profile and the preferences editor for a user with self.preferences', async () => {
    backend();
    server.use(
      http.get('/v1/me', ({ response }) =>
        response(200).json(
          me({
            permissions: ['self.preferences'],
            roles: [{ id: '00000000-0000-4000-8000-0000000000dd', name: 'Analyst' }],
          }),
        ),
      ),
      http.get('/v1/me/preferences', ({ response }) => response(200).json(userPreferences())),
      http.get('/v1/me/notification-preferences', ({ response }) =>
        response(200).json([notificationPreference()]),
      ),
    );

    render(<App session={signedInSession()} initialPath="/account" />);

    expect(await screen.findByTestId('account-email')).toHaveTextContent('analyst@example.test');
    expect(screen.getByText('Analyst')).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeInTheDocument();
  });

  it('saves a theme change through updateMyPreferences', async () => {
    backend();
    let sent: { theme?: unknown } | undefined;
    server.use(
      http.get('/v1/me', ({ response }) =>
        response(200).json(me({ permissions: ['self.preferences'] })),
      ),
      http.get('/v1/me/preferences', ({ response }) => response(200).json(userPreferences())),
      http.get('/v1/me/notification-preferences', ({ response }) => response(200).json([])),
      http.put('/v1/me/preferences', async ({ request, response }) => {
        sent = (await request.json()) as { theme?: unknown };
        return response(200).json(userPreferences({ theme: 'light' }));
      }),
    );

    const user = userEvent.setup();
    render(<App session={signedInSession()} initialPath="/account" />);
    await screen.findByRole('group', { name: 'Theme' });

    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => expect(sent).toMatchObject({ theme: 'light' }));
    expect(await screen.findByText(/applied across the app/i)).toBeInTheDocument();
  });

  it('hides the editor for a signed-in user lacking self.preferences', async () => {
    backend();
    server.use(
      http.get('/v1/me', ({ response }) => response(200).json(me({ permissions: ['data.read'] }))),
      http.get('/v1/me/preferences', ({ response }) => response(200).json(userPreferences())),
    );

    render(<App session={signedInSession()} initialPath="/account" />);

    expect(await screen.findByTestId('account-email')).toBeInTheDocument();
    expect(screen.getByText(/does not include managing your own preferences/i)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Theme' })).not.toBeInTheDocument();
  });

  it('prompts an anonymous visitor to sign in', async () => {
    backend();
    render(
      <App
        session={createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false })}
        initialPath="/account"
      />,
    );
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
    expect(screen.queryByRole('group', { name: 'Theme' })).not.toBeInTheDocument();
  });
});
