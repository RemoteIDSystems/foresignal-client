import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Me, PrincipalStore } from '../api/me';
import { PrincipalStoreContext } from '../api/useMe';
import { createForesignalClient } from '../api/client';
import { me as meFixture, ownershipChain as ownershipChainFixture } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { OwnershipChainPanel } from './OwnershipChainPanel';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function store(value: Me | null): PrincipalStore {
  return { get: () => value, subscribe: () => () => {}, load: async () => {}, clear: () => {} };
}
const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

function renderPanel(permissions: string[], onOpen = vi.fn()) {
  render(
    <PrincipalStoreContext.Provider value={store(meFixture({ permissions }))}>
      <OwnershipChainPanel api={client()} seedRef="organization:seed" onOpen={onOpen} />
    </PrincipalStoreContext.Provider>,
  );
  return onOpen;
}

describe('OwnershipChainPanel', () => {
  it('walks the chain and lists reached entities that open on click', async () => {
    server.use(
      http.post('/v1/graph/ownership-chain', ({ response }) =>
        response(200).json(ownershipChainFixture()),
      ),
    );
    const user = userEvent.setup();
    const onOpen = renderPanel(['data.read']);

    await user.click(screen.getByRole('button', { name: 'Expand ownership chain' }));
    const node = await screen.findByText('Parent Co');
    await user.click(node);
    expect(onOpen).toHaveBeenCalledWith('organization:01J0000000000000000000000P');
  });

  it('is hidden for a principal without data.read', () => {
    const { container } = render(
      <PrincipalStoreContext.Provider value={store(meFixture({ permissions: [] }))}>
        <OwnershipChainPanel api={client()} seedRef="organization:seed" onOpen={vi.fn()} />
      </PrincipalStoreContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
