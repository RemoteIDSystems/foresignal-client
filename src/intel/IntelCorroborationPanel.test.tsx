import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Me, PrincipalStore } from '../api/me';
import { PrincipalStoreContext } from '../api/useMe';
import { createForesignalClient } from '../api/client';
import { intelCorroboration, me as meFixture } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { IntelCorroborationPanel } from './IntelCorroborationPanel';

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

function renderPanel(permissions: string[]) {
  return render(
    <PrincipalStoreContext.Provider value={store(meFixture({ permissions }))}>
      <IntelCorroborationPanel api={client()} />
    </PrincipalStoreContext.Provider>,
  );
}

describe('IntelCorroborationPanel', () => {
  it('renders the policy gates for a principal with intel.read', async () => {
    server.use(
      http.get('/v1/intel/corroboration', ({ response }) =>
        response(200).json(intelCorroboration()),
      ),
    );
    renderPanel(['intel.read']);
    expect(await screen.findByText('Event quality')).toBeInTheDocument();
    expect(screen.getByText('Situation activation')).toBeInTheDocument();
    expect(screen.getByText('Auto-corroborate')).toBeInTheDocument();
  });

  it('is hidden for a principal without intel.read', () => {
    const { container } = renderPanel(['data.read']);
    expect(container).toBeEmptyDOMElement();
  });
});
