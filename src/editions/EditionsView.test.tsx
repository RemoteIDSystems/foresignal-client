import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function backend(items: EditionSummary[], permissions: string[] = ['data.read']) {
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
    http.get('/v1/me', ({ response }) => response(200).json(me({ permissions }))),
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

  it('shows manage affordances only to a user holding self.editions', async () => {
    backend([edition()], ['self.editions']);
    render(<App session={signedInSession()} initialPath="/editions" />);

    expect(await screen.findByRole('button', { name: 'New edition' })).toBeInTheDocument();
    const edit = screen.getByRole('link', { name: 'Edit' });
    expect(edit).toHaveAttribute('href', '/editions/00000000-0000-4000-8000-000000000001/edit');
    expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides manage affordances from a user without self.editions', async () => {
    backend([edition()], ['data.read']);
    render(<App session={signedInSession()} initialPath="/editions" />);

    await screen.findByRole('link', { name: /Morning Brief/ });
    expect(screen.queryByRole('button', { name: 'New edition' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('runs an edition on demand', async () => {
    backend([edition()], ['self.editions']);
    let ran = false;
    server.use(
      http.post('/v1/me/editions/{briefingId}/run', ({ response }) => {
        ran = true;
        return response(202).json({
          status: 'running',
          startedAt: '2026-10-30T07:00:00Z',
          periodFrom: '2026-10-29T07:00:00Z',
          periodTo: '2026-10-30T07:00:00Z',
          contentMarkdown: '',
        });
      }),
    );

    const user = userEvent.setup();
    render(<App session={signedInSession()} initialPath="/editions" />);
    await user.click(await screen.findByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(ran).toBe(true));
  });

  it('deletes an edition after confirmation', async () => {
    backend([edition()], ['self.editions']);
    let deleted = false;
    server.use(
      http.delete('/v1/me/editions/{briefingId}', ({ response }) => {
        deleted = true;
        return response(204).empty();
      }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    render(<App session={signedInSession()} initialPath="/editions" />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toBe(true));
    confirm.mockRestore();
  });
});
