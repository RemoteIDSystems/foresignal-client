import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { contract, systemInfo } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { App } from './App';
import { createSession } from './session';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => localStorage.clear());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Serves the capability calls, recording the Authorization header each one carried. */
function backend(apiVersion = '1.0.0') {
  const authorization: Array<string | null> = [];
  const devices: unknown[] = [];
  server.use(
    http.get('/v1/system', ({ request, response }) => {
      authorization.push(request.headers.get('Authorization'));
      return response(200).json(systemInfo(apiVersion));
    }),
    http.get('/v1/contract', ({ response }) => response(200).json(contract())),
    http.put('/v1/tokens/current/device', async ({ request, response }) => {
      devices.push(await request.json());
      return response(200).json({
        id: '00000000-0000-4000-8000-000000000001',
        name: 'test',
        scope: 'read',
        tokenPrefix: 'fsr_test',
        createdAt: '2026-10-19T00:00:00Z',
      });
    }),
  );
  return { authorization, devices };
}

const session = () => createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false });

describe('App settings', () => {
  it('reads the backend with no token (open reads)', async () => {
    const { authorization, devices } = backend();
    render(<App session={session()} initialPath="/settings" />);
    expect(await screen.findByTestId('backend-version')).toHaveTextContent('1.0.0');
    expect(screen.getByTestId('token-state')).toHaveTextContent('No token: using open reads.');
    expect(screen.queryByTestId('version-mismatch')).not.toBeInTheDocument();
    expect(authorization).toEqual([null]);
    expect(devices).toEqual([]);
  });

  it('sends the bearer and reports the device once a token is saved', async () => {
    const { authorization, devices } = backend();
    const user = userEvent.setup();
    render(<App session={session()} initialPath="/settings" />);
    await screen.findByTestId('backend-version');
    await user.type(screen.getByLabelText('Token'), 'fsr_secret');
    await user.click(screen.getByRole('button', { name: 'Save token' }));
    await waitFor(() => expect(authorization).toEqual([null, 'Bearer fsr_secret']));
    await waitFor(() => expect(devices).toHaveLength(1));
    expect(devices[0]).toMatchObject({ platform: 'web' });
    expect(screen.getByTestId('token-state')).toHaveTextContent('A token is set (fsr_secr…).');
  });

  it('shows a banner when the backend API version differs from the vendored spec', async () => {
    backend('9.9.9');
    render(<App session={session()} initialPath="/settings" />);
    expect(await screen.findByTestId('version-mismatch')).toHaveTextContent(
      'built for API version 1.0.0, but the backend reports 9.9.9',
    );
  });

  it('claims a pairing code and stores the returned token', async () => {
    backend();
    let claimed: unknown;
    server.use(
      http.post('/v1/pairing/claim', async ({ request, response }) => {
        claimed = await request.json();
        return response(201).json({
          id: '00000000-0000-4000-8000-000000000002',
          name: 'paired',
          scope: 'read',
          tokenPrefix: 'fsr_pair',
          createdAt: '2026-10-19T00:00:00Z',
          token: 'fsr_paired_token',
        });
      }),
    );
    const user = userEvent.setup();
    const s = session();
    render(<App session={s} initialPath="/settings" />);
    await user.type(screen.getByLabelText('Pairing code'), 'ABCD-EFGH');
    await act(() => user.click(screen.getByRole('button', { name: 'Claim' })));
    expect(await screen.findByRole('status')).toHaveTextContent('Paired. Token fsr_pair… saved');
    expect(claimed).toMatchObject({ code: 'ABCD-EFGH', device: { platform: 'web' } });
    expect(s.tokens.get()).toBe('fsr_paired_token');
  });
});

describe('App routing', () => {
  it('opens on the Global dashboard and swaps the view on a tab change', async () => {
    backend();
    const user = userEvent.setup();
    render(<App session={session()} initialPath="/" />);
    expect(await screen.findByRole('region', { name: 'Selected entity' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Global' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('link', { name: 'Analyst' }));
    expect(screen.getByRole('heading', { name: 'Analyst Workbench' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected entity' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analyst' })).toHaveAttribute('aria-current', 'page');
  });

  it('routes every primary tab to its own view', async () => {
    backend();
    const user = userEvent.setup();
    render(<App session={session()} initialPath="/global" />);
    const expected: Record<string, string> = {
      Map: 'Map',
      Imagery: 'Imagery',
      Satellites: 'Satellite Operations',
      'RF / Sensors': 'RF / Sensors',
      Intelligence: 'Intelligence',
      Operations: 'Operations',
    };
    for (const [tab, heading] of Object.entries(expected)) {
      await user.click(screen.getByRole('link', { name: tab }));
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    }
  });

  it('sends unknown paths to the Global dashboard', async () => {
    backend();
    render(<App session={session()} initialPath="/no-such-screen" />);
    expect(await screen.findByRole('region', { name: 'Selected entity' })).toBeInTheDocument();
  });

  it('opens Settings from the gear button', async () => {
    backend();
    const user = userEvent.setup();
    render(<App session={session()} initialPath="/global" />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});

describe('About', () => {
  it('opens from Settings and credits Cesium, the NASA imagery and every package', async () => {
    backend();
    const user = userEvent.setup();
    render(<App session={session()} initialPath="/settings" />);
    await user.click(await screen.findByRole('link', { name: 'About and credits' }));
    expect(await screen.findByRole('heading', { name: 'About ForeSignal Client' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Cesium' })).toBeVisible();
    expect(screen.getByTestId('data-credits')).toHaveTextContent('Blue Marble');
    expect(screen.getByTestId('data-credits')).toHaveTextContent('Black Marble');
    expect(screen.getByRole('row', { name: /cesium 1\.146\.0 Apache-2\.0/ })).toBeVisible();
  });
});
