import { createStore, INITIAL_STATE, type AppState } from '../state/store';
import { flyToPlaceOnMap, openViewOnMap } from './openSaved';
import {
  flyToBox,
  flyToPlace,
  heightForBox,
  parseItems,
  pointPlace,
  slugOf,
  temperatureSeries,
  viewFromMap,
  watchlistView,
  watchlistViewSlug,
  weatherRows,
} from './savedView';
import { place, savedView } from './testing/savedFixtures';

describe('saved state', () => {
  it('makes unique slugs from names', () => {
    expect(slugOf('Gulf Coast — Ships & Planes', new Set())).toBe('gulf-coast-ships-planes');
    expect(slugOf('Gulf', new Set(['gulf', 'gulf-2']))).toBe('gulf-3');
    expect(slugOf('Zürich', new Set())).toBe('zurich');
    expect(slugOf('—', new Set(), 'place')).toBe('place');
    expect(slugOf('x'.repeat(80), new Set()).length).toBe(64);
  });

  it('saves the map’s kinds, view and, with hidden sources, the sources it keeps', () => {
    const sourcesOf = (kind: string) =>
      ({ earthquake: ['usgs-earthquakes', 'emsc'], aircraft: ['adsb'] })[kind] ?? [];
    expect(
      viewFromMap(
        ' Quakes ',
        {
          kinds: ['earthquake', 'aircraft'],
          hiddenSources: new Set(['emsc']),
          sourcesOf,
          bbox: [-130, 20, -60, 55],
        },
        'quakes',
      ),
    ).toEqual({
      slug: 'quakes',
      name: 'Quakes',
      kinds: ['aircraft', 'earthquake'],
      sources: ['adsb', 'usgs-earthquakes'],
      bbox: [-130, 20, -60, 55],
      timeField: 'effective',
      includeExpired: false,
    });
    expect(
      viewFromMap('All', { kinds: ['earthquake'], hiddenSources: new Set(), sourcesOf }, 'all'),
    ).not.toHaveProperty('sources');
  });

  it('flies to a box, across the antimeridian too', () => {
    expect(flyToBox([-10, -10, 10, 10])).toMatchObject({ longitude: 0, latitude: 0 });
    expect(flyToBox([170, -10, -170, 10]).longitude).toBe(180);
    expect(heightForBox([0, 0, 0.001, 0.001])).toBe(1_000);
    expect(heightForBox([-180, -90, 180, 90])).toBe(8_000_000);
  });

  it('flies to a point place from four times its radius, and to a polygon’s box', () => {
    expect(flyToPlace(place())).toEqual({ longitude: -95.36, latitude: 29.76, height: 80_000 });
    expect(
      flyToPlace(
        place({
          shape: 'polygon',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [2, 0],
                [2, 2],
                [0, 0],
              ],
            ],
          },
        }),
      ),
    ).toMatchObject({ longitude: 1, latitude: 1 });
  });

  it('writes a point place and reads watchlist items from text', () => {
    expect(pointPlace('Port of Houston', -95.27, 29.73, 15, new Set())).toEqual({
      id: 'port-of-houston',
      name: 'Port of Houston',
      shape: 'point',
      geometry: { type: 'Point', coordinates: [-95.27, 29.73] },
      radiusKm: 15,
      kind: 'user',
      sensitive: true,
    });
    expect(parseItems('a1b2c3\n\n  N123AB, Survey plane \nx,')).toEqual([
      { value: 'a1b2c3' },
      { value: 'N123AB', label: 'Survey plane' },
      { value: 'x' },
    ]);
  });

  it('tracks a watchlist with its own inWatchlist view', () => {
    expect(watchlistViewSlug('01HVXK')).toBe('watchlist-01hvxk');
    expect(watchlistView({ id: '01HVXK', name: 'Vessels' })).toMatchObject({
      slug: 'watchlist-01hvxk',
      name: 'Watchlist: Vessels',
      conditions: [{ op: 'inWatchlist', value: '01HVXK' }],
    });
  });

  it('shows the place weather sections and forecast as the backend reports them', () => {
    expect(
      weatherRows({
        place: 'houston',
        radiusKm: 20,
        automated: true,
        radar: { status: 'ok', maxDbzInRadius: 42 },
        hail: { status: 'no-coverage', statusText: 'Outside MRMS coverage' },
      } as never),
    ).toEqual([
      { section: 'Radar', status: 'ok', text: '42 dBZ max' },
      { section: 'Hail', status: 'no-coverage', text: 'Outside MRMS coverage' },
    ]);
    expect(
      temperatureSeries({
        placeId: 'houston',
        serverTime: '2026-10-20T12:00:00Z',
        forecastSeries: [
          {
            provider: 'gfs',
            updatedAt: '2026-10-20T06:00:00Z',
            items: [
              { time: '2026-10-20T12:00:00Z', tempC: 24 },
              { time: '2026-10-20T15:00:00Z', tempC: null },
            ],
          },
          { provider: 'nws', updatedAt: '2026-10-20T06:00:00Z', items: [] },
        ],
      }),
    ).toEqual([{ name: 'GFS', points: [[Date.parse('2026-10-20T12:00:00Z'), 24]] }]);
  });

  it('opens a view on the map with its kinds, and flies to a place', () => {
    const store = createStore<AppState>({ ...INITIAL_STATE, savedOpen: 'views' });
    openViewOnMap(store, savedView());
    expect(store.get('layers')).toMatchObject({
      view: 'view-1',
      kinds: ['aircraft', 'earthquake'],
    });
    expect(store.get('locate')).toMatchObject({ longitude: -95, latitude: 37.5 });
    expect(store.get('savedOpen')).toBeUndefined();
    store.set('savedOpen', 'places');
    expect(flyToPlaceOnMap(store, place())).toBe(true);
    expect(store.get('locate')).toMatchObject({ longitude: -95.36, latitude: 29.76 });
    expect(flyToPlaceOnMap(store, place({ geometry: { type: 'Point', coordinates: [] } }))).toBe(
      false,
    );
  });
});
