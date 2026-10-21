import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { json, standInApi } from '../../intel/testing/standIn';
import type { RecordHit } from '../../map/records/recordPicking';
import type { Sensor } from '../../satellites/satelliteApi';
import { SOURCE_SENSOR, STATION_SENSOR } from '../../satellites/testing/satelliteFixtures';
import { createStore, INITIAL_STATE, type AppState } from '../../state/store';
import { RfSensorsView } from './RfSensorsView';

// jsdom has no WebGL: the map is a box that says which layers it was asked to draw.
vi.mock('../../map/Viewer', () => ({
  MapViewer: ({ recordLayers }: { recordLayers?: readonly string[] }) => (
    <div data-testid="map-viewer" data-layers={(recordLayers ?? []).join(',')} />
  ),
}));
vi.mock('../../map/style/useOverlayStyle', () => ({
  useOverlayStyle: () => ({ status: 'loading' }),
}));
vi.mock('../../map/records/useLayerCatalog', () => {
  const kinds = [
    {
      id: 'aprs-station',
      label: 'APRS Station',
      category: 'rf',
      sources: ['local-aprs-1'],
      count: 4,
    },
    { id: 'scanner', label: 'Scanner', category: 'rf', sources: [], count: 0 },
  ];
  return {
    useLayerCatalog: () => ({
      status: 'ready',
      catalog: {
        categories: [{ id: 'rf', label: 'RF / Spectrum', kinds, count: 4 }],
        kinds,
        sources: [],
      },
    }),
  };
});

const STATION: Sensor = {
  ...STATION_SENSOR,
  geometry: { type: 'Point', coordinates: [-95.36, 29.76] },
  provenance: { sourceIds: ['satdump-1'] },
};

function renderView({ plot = 'pass' }: { plot?: 'pass' | 'none' } = {}) {
  const store = createStore<AppState>({
    ...INITIAL_STATE,
    viewport: { bbox: [-100, 25, -90, 35], zoom: 5 },
  });
  const stand = standInApi({
    'GET /v1/sensors': () =>
      json({
        from: '2026-10-21T00:00:00Z',
        to: '2026-10-21T06:00:00Z',
        items: [SOURCE_SENSOR, STATION],
        note: 'Foresignal cannot task public satellites or third-party sensors',
      }),
    'GET /v1/ground-stations/satdump-1/polarplot.jpeg': () =>
      plot === 'pass'
        ? new Response(new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          })
        : json(
            { title: 'Not Found', status: 404, code: 'NO_ACTIVE_PASS', detail: 'No active pass.' },
            404,
          ),
    'GET /v1/records': () =>
      json({
        items: [
          {
            id: 'local-aprs-1/K5ABC-9',
            source: 'local-aprs-1',
            externalId: 'K5ABC-9',
            kind: 'aprs-station',
            version: 1,
            seq: 3,
            observedAt: '2026-10-21T00:10:00Z',
            payload: {},
            title: 'K5ABC-9',
            geometry: { type: 'Point', coordinates: [-95.1, 29.5] },
          },
        ],
        nextCursor: null,
      }),
    'GET /v1/objects/sensor%3Astation%3Asatdump-1/dossier': () =>
      json({
        ref: STATION.ref,
        envelope: { ...STATION, summary: 'SatDump autotrack station' },
        generatedAt: '2026-10-21T00:00:00Z',
        sections: { overview: { status: 'ok', fields: { antenna: 'QFH' } } },
      }),
    'GET /v1/objects/record%3Alocal-aprs-1%2FK5ABC-9/dossier': () =>
      json({
        ref: 'record:local-aprs-1/K5ABC-9',
        envelope: { ref: 'record:local-aprs-1/K5ABC-9', type: 'record', title: 'K5ABC-9' },
        generatedAt: '2026-10-21T00:00:00Z',
        sections: { overview: { status: 'ok', fields: { comment: 'Mobile' } } },
      }),
  });
  URL.createObjectURL = vi.fn(() => 'blob:polarplot');
  URL.revokeObjectURL = vi.fn();
  render(
    <MemoryRouter>
      <RfSensorsView api={stand.api} store={store} />
    </MemoryRouter>,
  );
  return { ...stand, store };
}

describe('the RF / Sensors workspace', () => {
  it('draws the RF kinds that have records, and turns one off', async () => {
    renderView();
    expect(screen.getByTestId('map-viewer')).toHaveAttribute('data-layers', 'aprs-station');
    await userEvent.click(screen.getByRole('checkbox', { name: /APRS Station/ }));
    expect(screen.getByTestId('map-viewer')).toHaveAttribute('data-layers', '');
    expect(await screen.findByText('No RF kind with records is on.')).toBeInTheDocument();
  });

  it('lists the sensor catalog over the view, filters it, and shows a station’s polar plot', async () => {
    const { asked } = renderView();
    const catalog = await screen.findByTestId('sensor-catalog');
    expect(
      within(catalog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['SatDump Houston', 'USGS Earthquakes']);
    expect(asked.find((line) => line.startsWith('GET /v1/sensors'))).toContain(
      'bbox=-100%2C25%2C-90%2C35',
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sensor kind' }), 'source');
    expect(within(catalog).getAllByRole('button')).toHaveLength(1);

    const stations = screen.getByTestId('ground-stations');
    const plot = await within(stations).findByRole('img', {
      name: 'Live pass polar plot from SatDump Houston',
    });
    expect(plot).toHaveAttribute('src', 'blob:polarplot');
  });

  it('says when a station tracks no pass', async () => {
    renderView({ plot: 'none' });
    const stations = await screen.findByTestId('ground-stations');
    expect(await within(stations).findByText('No active pass.')).toBeInTheDocument();
    expect(within(stations).getByTestId('polarplot')).toHaveAttribute('data-state', 'no-pass');
  });

  it('selects a sensor into the shared selection, moves the map, and shows its detail', async () => {
    const { store } = renderView();
    const catalog = await screen.findByTestId('sensor-catalog');
    await userEvent.click(within(catalog).getByRole('button', { name: 'SatDump Houston' }));
    expect((store.get('selection') as RecordHit).id.ref).toBe('sensor:station:satdump-1');
    expect(store.get('locate')).toMatchObject({ longitude: -95.36, latitude: 29.76 });
    const detail = screen.getByTestId('rf-detail');
    expect(await within(detail).findByText('SatDump autotrack station')).toBeInTheDocument();
    expect(within(detail).getByTestId('rf-facts')).toHaveTextContent('Sensor Kindstation');
    expect(within(detail).getByTestId('rf-facts')).toHaveTextContent('AntennaQFH');
    await userEvent.click(within(detail).getByRole('button', { name: 'Clear the selection' }));
    expect(store.get('selection')).toBeUndefined();
  });

  it('selects a signal from the list as the map would pick it', async () => {
    const { store } = renderView();
    const table = await screen.findByTestId('signal-table');
    await userEvent.click(within(table).getByRole('button', { name: 'K5ABC-9' }));
    expect(store.get('selection')).toMatchObject({
      id: { kind: 'aprs-station', source: 'local-aprs-1', externalId: 'K5ABC-9' },
    });
    const detail = screen.getByTestId('rf-detail');
    expect(await within(detail).findByText('Mobile')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Open on Global →' })).toBeEnabled();
  });
});
