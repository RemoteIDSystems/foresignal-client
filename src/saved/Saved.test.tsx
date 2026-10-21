import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { json, standInApi } from '../intel/testing/standIn';
import { createStore, INITIAL_STATE, type AppState, type Store } from '../state/store';
import { RecordLayersContext, type RecordLayersValue } from '../views/global/recordLayersContext';
import { SavedRailSection } from './SavedRailSection';
import { SavedStateDialog } from './SavedStateDialog';
import { place, savedView, watchlist } from './testing/savedFixtures';

/** Shows the route, so a test can see where opening something went. */
function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

/** The Global rail's saved section over a stand-in backend, with two kinds drawn. */
function renderRail(store: Store<AppState>, extra: Partial<RecordLayersValue> = {}) {
  const stand = standInApi({
    'GET /v1/views': () => json({ items: [savedView({ slug: 'quakes' })], nextCursor: null }),
    'POST /v1/views': async (request) =>
      json(savedView({ ...((await request.json()) as object), id: 'view-2' }), 201),
    'GET /v1/views/view-1': () => json(savedView()),
  });
  const value = {
    api: stand.api,
    store,
    catalog: {
      status: 'ready',
      catalog: {
        categories: [],
        kinds: [
          {
            id: 'earthquake',
            label: 'Earthquake',
            category: 'hazards',
            sources: ['usgs', 'emsc'],
            count: 1,
          },
          { id: 'aircraft', label: 'Aircraft', category: 'aircraft', sources: ['adsb'], count: 1 },
        ],
        sources: [],
      },
    },
    hiddenSources: new Set(['emsc']),
    drawnKinds: ['earthquake', 'aircraft'],
    statuses: {},
    ...extra,
  } as unknown as RecordLayersValue;
  render(
    <RecordLayersContext.Provider value={value}>
      <SavedRailSection />
    </RecordLayersContext.Provider>,
  );
  return stand;
}

describe('the Global rail’s saved state', () => {
  it('saves the drawn kinds, the kept sources and the map’s view as a view', async () => {
    const store = createStore<AppState>({
      ...INITIAL_STATE,
      viewport: { bbox: [-130, 20, -60, 55], zoom: 3 },
    });
    const { asked, bodies } = renderRail(store);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save view' }));
    await user.type(screen.getByRole('textbox', { name: 'View name' }), 'Quakes');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved “Quakes”.')).toBeInTheDocument();
    expect(asked).toEqual(['GET /v1/views?limit=200', 'POST /v1/views']);
    expect(bodies[1]).toEqual({
      // `quakes` is taken.
      slug: 'quakes-2',
      name: 'Quakes',
      kinds: ['aircraft', 'earthquake'],
      sources: ['adsb', 'usgs'],
      bbox: [-130, 20, -60, 55],
      timeField: 'effective',
      includeExpired: false,
    });

    await user.click(screen.getByRole('button', { name: 'Places' }));
    expect(store.get('savedOpen')).toBe('places');
  });

  it('shows the open view with its layer’s state, and closes it', async () => {
    const store = createStore<AppState>(INITIAL_STATE);
    const closeView = vi.fn();
    renderRail(store, {
      openView: 'view-1',
      closeView,
      statuses: { 'view:view-1': { state: 'ready', features: 12, tiles: 4 } },
    });
    const open = screen.getByTestId('open-view');
    expect(open).toHaveAttribute('data-state', 'ready');
    expect(await within(open).findByText('Quakes and planes')).toBeInTheDocument();
    expect(open).toHaveTextContent('ready, 12 records');
    expect(screen.getByRole('button', { name: 'Save view' })).toBeDisabled();
    await userEvent.click(within(open).getByRole('button', { name: 'Close saved view' }));
    expect(closeView).toHaveBeenCalled();
  });
});

/** The dialog open on `tab` over a stand-in backend. */
function renderDialog(tab: AppState['savedOpen'], token: string | null = 'token') {
  const store = createStore<AppState>({
    ...INITIAL_STATE,
    savedOpen: tab,
    viewport: { bbox: [-100, 20, -90, 30], zoom: 5 },
  });
  const stand = standInApi({
    'GET /v1/views': () => json({ items: [savedView()], nextCursor: null }),
    'GET /v1/views/view-1/records': () =>
      json({
        items: [
          {
            id: 'usgs/us1',
            source: 'usgs',
            externalId: 'us1',
            kind: 'earthquake',
            version: 1,
            seq: 5,
            observedAt: '2026-10-20T11:00:00Z',
            payload: {},
            title: 'M5.1 Gulf of Mexico',
          },
        ],
        nextCursor: null,
      }),
    'GET /v1/places': () => json({ items: [place()], nextCursor: null }),
    'POST /v1/places': async (request) => json(place((await request.json()) as never), 201),
    'GET /v1/places/houston/weather': () =>
      json({
        placeId: 'houston',
        serverTime: '2026-10-20T12:00:00Z',
        weather: {
          place: 'houston',
          radiusKm: 20,
          automated: true,
          radar: { status: 'ok', maxDbzInRadius: 30 },
        },
        forecastSeries: [],
      }),
    'GET /v1/watchlists': () => json({ items: [watchlist()], nextCursor: null }),
    'GET /v1/watchlists/01HVXK/items': () =>
      json({
        items: [
          { value: 'A1B2C3', label: 'Survey 1', addedAt: '2026-10-20T10:00:00Z', origin: 'manual' },
        ],
        nextCursor: null,
      }),
    'POST /v1/watchlists/01HVXK/items': () =>
      json({ dryRun: false, added: 1, updated: 0, removed: 0, invalid: [], itemCount: 2 }),
  });
  const onOpen = vi.fn();
  render(
    <MemoryRouter initialEntries={['/analyst']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <Where />
              <SavedStateDialog api={stand.api} store={store} token={token} onOpen={onOpen} />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { ...stand, store, onOpen };
}

describe('the saved-state dialog', () => {
  it('opens a saved view on the Global map, and lists its records', async () => {
    const { store, onOpen } = renderDialog('views');
    const user = userEvent.setup();
    const row = await screen.findByRole('listitem', { name: 'Quakes and planes' });
    await user.click(within(row).getByRole('button', { name: 'Records' }));
    await user.click(await within(row).findByRole('button', { name: 'M5.1 Gulf of Mexico' }));
    expect(onOpen).toHaveBeenCalledWith('record:usgs/us1');
    store.set('savedOpen', 'views');
    await user.click(
      within(await screen.findByRole('listitem', { name: 'Quakes and planes' })).getByRole(
        'button',
        { name: 'Open' },
      ),
    );
    expect(store.get('layers')).toMatchObject({
      view: 'view-1',
      kinds: ['aircraft', 'earthquake'],
    });
    expect(screen.getByTestId('where')).toHaveTextContent('/global');
  });

  it('flies to a place, shows its weather, and adds one at the map’s center', async () => {
    const { store, bodies, asked } = renderDialog('places');
    const user = userEvent.setup();
    const row = await screen.findByRole('listitem', { name: 'Houston' });
    await user.click(within(row).getByRole('button', { name: 'Weather' }));
    const weather = await within(row).findByRole('region', { name: 'Weather at Houston' });
    expect(weather).toHaveTextContent('30 dBZ max');
    const form = screen.getByRole('form', { name: 'New place' });
    expect(within(form).getByRole('textbox', { name: 'Longitude' })).toHaveValue('-95.0000');
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Galveston');
    await user.click(within(form).getByRole('button', { name: 'Add place' }));
    expect(await screen.findByText('Created “Galveston”.')).toBeInTheDocument();
    // The lists read again after a change, so the create is found by its request, not by order.
    expect(bodies[asked.indexOf('POST /v1/places')]).toMatchObject({
      id: 'galveston',
      shape: 'point',
      radiusKm: 20,
    });
    await user.click(within(row).getByRole('button', { name: 'Fly to' }));
    expect(store.get('locate')).toMatchObject({ longitude: -95.36, latitude: 29.76 });
  });

  it('lists a watchlist’s items, adds items and offers to track its current state', async () => {
    const { bodies, asked } = renderDialog('watchlists');
    const user = userEvent.setup();
    const row = await screen.findByRole('listitem', { name: 'Survey aircraft' });
    await user.click(within(row).getByRole('button', { name: 'Open' }));
    expect(await within(row).findByText('A1B2C3')).toBeInTheDocument();
    await user.type(
      within(row).getByRole('textbox', { name: /Items, one per line/ }),
      'D4E5F6, Survey 2',
    );
    await user.click(within(row).getByRole('button', { name: 'Add items' }));
    expect(await within(row).findByText('1 added, 0 updated.')).toBeInTheDocument();
    expect(bodies[asked.indexOf('POST /v1/watchlists/01HVXK/items')]).toEqual({
      items: [{ value: 'D4E5F6', label: 'Survey 2' }],
    });
    expect(within(row).getByRole('button', { name: 'Track current state' })).toBeEnabled();
    expect(
      within(row).getByRole('link', { name: 'Create alert for this watchlist' }),
    ).toHaveAttribute('href', '/alerts?new=watchlist&ref=01HVXK');
  });

  it('says places and watchlists need a token', async () => {
    renderDialog('places', null);
    expect(await screen.findByText(/needs an access token/)).toBeInTheDocument();
  });
});
