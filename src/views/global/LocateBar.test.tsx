import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createForesignalClient } from '../../api/client';
import { createStore, INITIAL_STATE, type AppState } from '../../state/store';
import { COUNTRY_HEIGHT_M, LocateBar, POINT_HEIGHT_M } from './LocateBar';
import { RecordLayersContext, type RecordLayersValue } from './recordLayersContext';

function renderBar() {
  const store = createStore<AppState>(INITIAL_STATE);
  const api = createForesignalClient({
    baseUrl: 'http://api.test',
    retry: false,
    fetch: async () =>
      new Response(
        JSON.stringify([
          { iso2: 'JP', iso3: 'JPN', name: 'Japan', labelLon: 138.4, labelLat: 36.2, aliases: [] },
        ]),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  });
  render(
    <RecordLayersContext.Provider
      value={{ catalog: { status: 'loading' }, api, store } as unknown as RecordLayersValue}
    >
      <LocateBar />
    </RecordLayersContext.Provider>,
  );
  return store;
}

describe('LocateBar', () => {
  it('moves the map to a country picked from the backend’s list', async () => {
    const store = renderBar();
    await userEvent.type(screen.getByRole('combobox'), 'jap');
    await userEvent.click(await screen.findByRole('option', { name: /Japan/ }));
    expect(store.get('locate')).toMatchObject({
      longitude: 138.4,
      latitude: 36.2,
      height: COUNTRY_HEIGHT_M,
    });
  });

  it('moves the map to typed coordinates on Enter', async () => {
    const store = renderBar();
    await userEvent.type(screen.getByRole('combobox'), '38.8N 122.7W{Enter}');
    expect(store.get('locate')).toMatchObject({
      longitude: -122.7,
      latitude: 38.8,
      height: POINT_HEIGHT_M,
    });
  });
});
