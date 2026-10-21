import { act, render, screen, waitFor, within } from '@testing-library/react';
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
      // Satellite Operations loads with its own chunk (027), so its heading arrives a moment later.
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    }
  });

  it('groups the backend’s kinds into the Global rail’s categories, with the mock’s set on', async () => {
    backend();
    server.use(
      http.get('/v1/tiles.json', ({ response }) =>
        response(200).json({
          tilejson: '3.0.0',
          layers: [
            {
              id: 'earthquake',
              type: 'kind',
              name: 'earthquake',
              tilejson: `${MOCK_BASE_URL}/v1/tiles/earthquake.json`,
              aggBelowZoom: null,
            },
            {
              id: 'aircraft',
              type: 'kind',
              name: 'aircraft',
              tilejson: `${MOCK_BASE_URL}/v1/tiles/aircraft.json`,
              aggBelowZoom: 7,
            },
            {
              id: 'social-post',
              type: 'kind',
              name: 'social-post',
              tilejson: `${MOCK_BASE_URL}/v1/tiles/social-post.json`,
              aggBelowZoom: null,
            },
          ],
        }),
      ),
      http.get('/v1/kinds', ({ response }) =>
        response(200).json([
          { kind: 'earthquake', currentCount: 540, sources: ['usgs-earthquakes'] },
        ]),
      ),
      // No overlay style: the rail still lists the layers, without icons.
      http.get('/v1/map/style.json', ({ response }) =>
        response(403).json({ title: 'Forbidden', status: 403 }),
      ),
    );
    render(<App session={session()} initialPath="/global" />);
    const rail = await screen.findByRole('region', { name: 'Layers' });
    // Events is checked in the mock, so social posts start on, though none are live now.
    expect(await within(rail).findByRole('checkbox', { name: 'Events' })).toBeChecked();
    // Earthquakes have records but sit under Disasters / Hazards, which the mock leaves off.
    expect(within(rail).getByRole('checkbox', { name: 'Disasters / Hazards' })).not.toBeChecked();
    expect(within(rail).getByRole('checkbox', { name: 'Aircraft (ADS-B)' })).not.toBeChecked();
    expect(within(rail).getByTestId('layers-on')).toHaveTextContent('1 on');
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
    server.use(
      http.get('/v1/attributions', ({ response }) =>
        response(200).json({
          text: '',
          attributions: [
            // Not required on the map, still credited here.
            {
              text: 'USGS Earthquake Hazards Program',
              licence: 'us-gov-public-domain',
              requiredDisplay: false,
              termsUrl:
                'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
            },
            { text: 'abuse.ch URLhaus', licence: 'provider-terms-nc', requiredDisplay: false },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<App session={session()} initialPath="/settings" />);
    await user.click(await screen.findByRole('link', { name: 'About and credits' }));
    expect(await screen.findByRole('heading', { name: 'About ForeSignal Client' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Cesium' })).toBeVisible();
    expect(screen.getByTestId('data-credits')).toHaveTextContent('Blue Marble');
    expect(screen.getByTestId('data-credits')).toHaveTextContent('Black Marble');
    expect(screen.getByTestId('data-credits')).toHaveTextContent('ETOPO 2022');
    expect(screen.getByRole('row', { name: /cesium 1\.146\.0 Apache-2\.0/ })).toBeVisible();
    const sources = await screen.findByTestId('source-credits');
    expect(
      within(sources)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      'abuse.ch URLhausprovider-terms-nc',
      'USGS Earthquake Hazards Programus-gov-public-domain',
    ]);
    expect(
      within(sources).getByRole('link', { name: 'USGS Earthquake Hazards Program' }),
    ).toHaveAttribute(
      'href',
      'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    );
    expect(screen.getByTestId('source-credits-count')).toHaveTextContent('2 attributions');
  });
});
