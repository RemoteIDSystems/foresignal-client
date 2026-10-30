import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Me, PrincipalStore } from '../api/me';
import { PrincipalStoreContext } from '../api/useMe';
import { createForesignalClient } from '../api/client';
import { me as meFixture, referenceArea, referenceAreaOutline } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { createStore, INITIAL_STATE, type AppState, type Store } from '../state/store';
import { ReferenceAreaPicker } from './ReferenceAreaPicker';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function principal(value: Me | null): PrincipalStore {
  return { get: () => value, subscribe: () => () => {}, load: async () => {}, clear: () => {} };
}
const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

function renderPicker(permissions: string[]): Store<AppState> {
  const store = createStore<AppState>(INITIAL_STATE);
  render(
    <PrincipalStoreContext.Provider value={principal(meFixture({ permissions }))}>
      <ReferenceAreaPicker api={client()} store={store} />
    </PrincipalStoreContext.Provider>,
  );
  return store;
}

describe('ReferenceAreaPicker', () => {
  it('searches areas and draws the selected outline into the store', async () => {
    server.use(
      http.get('/v1/reference/areas', ({ response }) => response(200).json([referenceArea()])),
      http.get('/v1/reference/areas/{code}', ({ response }) =>
        response(200).json(referenceAreaOutline()),
      ),
    );
    const user = userEvent.setup();
    const store = renderPicker(['data.read']);

    await user.type(screen.getByLabelText('Search reference areas'), 'France');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByText('France'));

    await waitFor(() => expect(store.get('referenceArea')?.label).toBe('France'));
    expect(store.get('referenceArea')?.geometry.type).toBe('Polygon');
  });

  it('is hidden for a principal without data.read', () => {
    const { container } = render(
      <PrincipalStoreContext.Provider value={principal(meFixture({ permissions: [] }))}>
        <ReferenceAreaPicker api={client()} store={createStore<AppState>(INITIAL_STATE)} />
      </PrincipalStoreContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
