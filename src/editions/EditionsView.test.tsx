import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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

function edition(overrides: Partial<EditionSummary> = {}): EditionSummary {
  return {
    briefingId: '00000000-0000-4000-8000-000000000001',
    name: 'Morning Brief',
    enabled: true,
    schedule: '0 7 * * *',
    timezone: 'UTC',
    outputLanguage: 'en',
    lastRunAt: '2026-10-30T07:00:00Z',
    lastRunStatus: 'ok',
    latestRunId: '00000000-0000-4000-8000-0000000000ff',
    ...overrides,
  };
}

function backend(items: EditionSummary[]) {
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
    http.get('/v1/me', ({ response }) => response(200).json(me({ permissions: ['data.read'] }))),
    http.get('/v1/me/preferences', ({ response }) =>
      response(200).json({ timezone: null, locale: null, theme: 'system', ui: {} }),
    ),
    http.get('/v1/me/editions', ({ response }) => response(200).json({ items, nextCursor: null })),
  );
}

function signedInSession() {
  const session = createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false });
  session.sessions.set({ token: 'fss_live' });
  return session;
}

describe('EditionsView', () => {
  it('lists a signed-in user’s editions with a link to each reader', async () => {
    backend([edition()]);
    render(<App session={signedInSession()} initialPath="/editions" />);

    const link = await screen.findByRole('link', { name: /Morning Brief/ });
    expect(link).toHaveAttribute('href', '/editions/00000000-0000-4000-8000-000000000001');
    expect(screen.getByText(/Last edition/)).toBeInTheDocument();
  });

  it('shows an empty state when the user has no editions', async () => {
    backend([]);
    render(<App session={signedInSession()} initialPath="/editions" />);
    expect(await screen.findByRole('heading', { name: 'No editions yet' })).toBeInTheDocument();
  });

  it('offers an anonymous visitor a way to sign in', async () => {
    backend([edition()]);
    render(
      <App
        session={createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false })}
        initialPath="/editions"
      />,
    );
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });
});
