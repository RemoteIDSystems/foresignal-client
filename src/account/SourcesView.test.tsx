import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { createSession } from '../app/session';
import {
  contract,
  me,
  meLlmBudget,
  quotaUsage,
  sourceRelevanceAnalysis,
  systemInfo,
  userSourceView,
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

const ALL = ['self.sources', 'self.llm', 'self.alerts'];

function backend(permissions: string[] = ALL) {
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
    http.get('/v1/me/sources', ({ response }) => response(200).json(userSourceView())),
    http.get('/v1/me/quota', ({ response }) => response(200).json(quotaUsage())),
    http.get('/v1/me/llm/budget', ({ response }) => response(200).json(meLlmBudget())),
  );
}

function signedInSession() {
  const session = createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false });
  session.sessions.set({ token: 'fss_live' });
  return session;
}

describe('SourcesView', () => {
  it('lists the source view, saves a disable, and shows quota and budget', async () => {
    backend();
    let sent: { sources?: { sourceId: string; enabled: boolean }[] } | undefined;
    server.use(
      http.put('/v1/me/sources', async ({ request, response }) => {
        sent = (await request.json()) as typeof sent;
        return response(200).json(
          userSourceView([{ sourceId: 'usgs-earthquakes', enabled: false }]),
        );
      }),
    );

    const user = userEvent.setup();
    render(<App session={signedInSession()} initialPath="/account/sources" />);

    const toggle = await screen.findByRole('checkbox', { name: 'Show usgs-earthquakes' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Save source view' }));
    await waitFor(() =>
      expect(sent?.sources?.find((source) => source.sourceId === 'usgs-earthquakes')?.enabled).toBe(
        false,
      ),
    );

    // Quota pairs usage with limits; budget shows the month's spend.
    expect(await screen.findByText('3 / 10')).toBeInTheDocument();
    expect(screen.getByText(/\$1\.25/)).toBeInTheDocument();
  });

  it('runs the relevance analysis over the enabled sources', async () => {
    backend();
    server.use(
      http.post('/v1/triggers/analyze-sources', ({ response }) =>
        response(200).json(sourceRelevanceAnalysis()),
      ),
    );
    const user = userEvent.setup();
    render(<App session={signedInSession()} initialPath="/account/sources" />);

    await user.click(await screen.findByRole('button', { name: 'Analyze my enabled sources' }));
    expect(await screen.findByText('USGS Earthquakes')).toBeInTheDocument();
    expect(screen.getByText('relevant')).toBeInTheDocument();
    expect(screen.getByText('marginal')).toBeInTheDocument();
  });

  it('gates sections by permission', async () => {
    backend(['data.read']);
    render(<App session={signedInSession()} initialPath="/account/sources" />);

    expect(await screen.findByText(/does not include managing your sources/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'LLM budget' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Source relevance' })).not.toBeInTheDocument();
    // Quota is self-service and shows for any signed-in user.
    expect(screen.getByRole('heading', { name: 'Quota and usage' })).toBeInTheDocument();
  });

  it('sends an anonymous visitor to sign in', async () => {
    backend();
    render(
      <App
        session={createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false })}
        initialPath="/account/sources"
      />,
    );
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });
});
