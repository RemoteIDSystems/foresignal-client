import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { json, standInApi, type Answer } from '../../intel/testing/standIn';
import type { ConstellationLayerProps } from '../../satellites/ConstellationLayer';
import { NO_GP_DATA } from '../../satellites/satelliteApi';
import {
  GOES,
  ISS,
  SENTINEL,
  SENTINEL_SENSOR,
  SOURCE_SENSOR,
  STATION_SENSOR,
} from '../../satellites/testing/satelliteFixtures';
import { createStore, INITIAL_STATE } from '../../state/store';
import SatellitesScreen from './SatellitesScreen';

// jsdom has no WebGL: the map is its overlays and scene, and the constellation a button per
// satellite that selects it.
vi.mock('../../map', async (original) => ({
  ...(await original<typeof import('../../map')>()),
  MapViewer: ({ children, scene }: { children?: ReactNode; scene?: ReactNode }) => (
    <div data-testid="map-viewer">
      {scene}
      {children}
    </div>
  ),
}));
vi.mock('../../satellites/ConstellationLayer', () => ({
  ConstellationLayer: ({
    satellites,
    selected,
    onSelect,
    offsetHours,
  }: ConstellationLayerProps) => (
    <div data-testid="layer" data-offset={offsetHours} data-selected={selected}>
      {satellites.map((satellite) => (
        <button key={satellite.norad} type="button" onClick={() => onSelect(satellite.norad)}>
          {satellite.name}
        </button>
      ))}
    </div>
  ),
}));

/** A plain-text answer, as the CelesTrak-compatible endpoint gives when nothing matches. */
const text = (body: string) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });

/** Element sets by CelesTrak group. */
const GROUPS: Record<string, unknown[]> = {
  stations: [ISS],
  weather: [GOES],
  resource: [SENTINEL],
};

function renderScreen(answers: Record<string, Answer> = {}) {
  const stand = standInApi({
    'GET /compat/celestrak/gp.php': (request) => {
      const group = new URL(request.url).searchParams.get('GROUP') ?? '';
      return GROUPS[group] ? json(GROUPS[group]) : text(NO_GP_DATA);
    },
    'GET /v1/sensors': () =>
      json({
        from: '2026-10-21T00:00:00Z',
        to: '2026-10-22T00:00:00Z',
        items: [
          {
            ...SENTINEL_SENSOR,
            passes: [
              {
                aos: '2099-01-01T10:00:00Z',
                los: '2099-01-01T10:09:00Z',
                maxElevationDeg: 62.4,
              },
            ],
          },
          STATION_SENSOR,
          SOURCE_SENSOR,
        ],
        note: 'Foresignal cannot task public satellites or third-party sensors',
      }),
    'GET /v1/records': () => json({ items: [], nextCursor: null }),
    ...answers,
  });
  render(
    <MemoryRouter>
      <SatellitesScreen api={stand.api} store={createStore(INITIAL_STATE)} />
    </MemoryRouter>,
  );
  return stand;
}

const layer = () => screen.getByTestId('layer');
const constellation = () => screen.getByTestId('constellation');

describe('Satellite Operations', () => {
  it('draws the satellites of the sources it opens with, and counts them in the rail', async () => {
    const { asked } = renderScreen();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Satellite Operations');
    await vi.waitFor(() => expect(constellation()).toHaveAttribute('data-satellites', '3'));
    expect(
      within(layer())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['ISS (ZARYA)', 'GOES 19', 'SENTINEL-2A']);
    expect(asked).toEqual(
      expect.arrayContaining([
        'GET /compat/celestrak/gp.php?FORMAT=json&GROUP=stations',
        'GET /compat/celestrak/gp.php?FORMAT=json&GROUP=weather',
        'GET /compat/celestrak/gp.php?FORMAT=json&GROUP=resource',
      ]),
    );
    const sources = screen.getByRole('list', { name: 'Data sources' });
    expect(within(sources).getByText('Weather Satellites').closest('label')).toHaveTextContent('1');
    expect(within(sources).getByRole('checkbox', { name: /NORAD/ })).toBeDisabled();
  });

  it('shows a selected satellite’s facts, next pass and sensors, and clears it', async () => {
    renderScreen();
    await userEvent.click(
      await within(await screen.findByTestId('layer')).findByText('SENTINEL-2A'),
    );
    const panel = screen.getByRole('complementary', { name: 'Selected satellite' });
    expect(within(panel).getByRole('heading', { level: 3 })).toHaveTextContent('SENTINEL-2A');
    const facts = within(panel).getByTestId('satellite-facts');
    expect(facts).toHaveTextContent('NORAD ID40697');
    expect(facts).toHaveTextContent('Orbit TypeSun-synchronous');
    expect(await within(panel).findByText('ESA')).toBeInTheDocument();
    expect(within(panel).getByTestId('next-pass')).not.toBeEmptyDOMElement();
    expect(within(panel).getByTestId('satellite-sensors')).toHaveTextContent('MSI10 m');
    expect(within(panel).getByText(/cannot task/)).toBeInTheDocument();
    // The backend holds no record for it, so there are no details to open.
    expect(within(panel).getByRole('button', { name: 'View Details →' })).toBeDisabled();
    expect(layer()).toHaveAttribute('data-selected', '40697');

    await userEvent.click(within(panel).getByRole('button', { name: 'Clear the selection' }));
    expect(screen.getByRole('complementary', { name: 'Selected satellite' })).toHaveTextContent(
      'Select a satellite on the globe',
    );
  });

  it('finds a satellite by name', async () => {
    renderScreen();
    await vi.waitFor(() => expect(constellation()).toHaveAttribute('data-satellites', '3'));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a satellite' }), 'goes');
    const matches = screen.getByRole('list', { name: 'Matching satellites' });
    await userEvent.click(within(matches).getByRole('button', { name: /GOES 19/ }));
    expect(
      within(screen.getByRole('complementary', { name: 'Selected satellite' })).getByRole(
        'heading',
        { level: 3 },
      ),
    ).toHaveTextContent('GOES 19');
  });

  it('reads another source when it is turned on', async () => {
    const { asked } = renderScreen();
    await userEvent.click(screen.getByRole('checkbox', { name: /Starlink/ }));
    await vi.waitFor(() =>
      expect(asked).toContain('GET /compat/celestrak/gp.php?FORMAT=json&GROUP=starlink'),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Sentinel/ }));
    await vi.waitFor(() =>
      expect(asked).toContain('GET /compat/celestrak/gp.php?FORMAT=json&NAME=SENTINEL'),
    );
  });

  it('lists the upcoming passes, ground stations and sensor catalog over the view', async () => {
    renderScreen();
    const passes = await screen.findByTestId('pass-table');
    expect(passes).toHaveTextContent('2099-01-01 10:00Z');
    expect(passes).toHaveTextContent('MSI');
    expect(passes).toHaveTextContent('62°');
    expect(passes).toHaveTextContent('9 min');
    await vi.waitFor(() => expect(constellation()).toHaveAttribute('data-satellites', '3'));
    await userEvent.click(within(passes).getByRole('button', { name: 'SENTINEL-2A' }));
    expect(layer()).toHaveAttribute('data-selected', '40697');

    await userEvent.click(screen.getByRole('tab', { name: 'Ground Stations' }));
    expect(screen.getByTestId('sensor-table')).toHaveTextContent('SatDump Houston');
    expect(screen.getByTestId('sensor-table')).toHaveTextContent('2500 km');
    await userEvent.click(screen.getByRole('tab', { name: 'Sensor Catalog' }));
    expect(within(screen.getByTestId('sensor-table')).getAllByRole('row')).toHaveLength(4);
  });

  it('moves the clock with the scrubber, and LIVE brings it back', async () => {
    renderScreen();
    const slider = screen.getByRole('slider', { name: 'Hours from now' });
    fireEvent.change(slider, { target: { value: '6' } });
    expect(layer()).toHaveAttribute('data-offset', '6');
    const live = screen.getByRole('button', { name: '● LIVE' });
    expect(live).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(live);
    expect(layer()).toHaveAttribute('data-offset', '0');
    expect(live).toHaveAttribute('aria-pressed', 'true');
  });

  it('says when the backend holds no element sets', async () => {
    renderScreen({ 'GET /compat/celestrak/gp.php': () => text(NO_GP_DATA) });
    expect(
      await screen.findByText(/The backend holds no element sets for these sources yet/),
    ).toBeInTheDocument();
    expect(constellation()).toHaveAttribute('data-satellites', '0');
  });

  it('ends the bottom row with Recent Imagery and the Imagery Comparison', async () => {
    renderScreen();
    expect(screen.getByRole('region', { name: 'Recent imagery' })).toBeInTheDocument();
    const comparison = screen.getByRole('region', { name: 'Imagery comparison' });
    // This stand-in backend has no product catalog, so each says why it is empty.
    expect(await within(comparison).findByText(/Not Found/)).toBeInTheDocument();
    expect(within(comparison).getByRole('button', { name: /Run Change Detection/ })).toBeDisabled();
  });
});
