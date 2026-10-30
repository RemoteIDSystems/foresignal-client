import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EChartProps } from '../ui/charts/EChart';
import type { Me, PrincipalStore } from '../api/me';
import { PrincipalStoreContext } from '../api/useMe';
import { createForesignalClient } from '../api/client';
import { intelCalibration, me as meFixture } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { IntelCalibrationPanel } from './IntelCalibrationPanel';

vi.mock('../ui/charts/EChart', () => ({
  EChart: ({ testId }: EChartProps) => <div data-testid={testId} />,
}));

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
      <IntelCalibrationPanel api={client()} />
    </PrincipalStoreContext.Provider>,
  );
}

describe('IntelCalibrationPanel', () => {
  it('renders each scope for a principal with intel.read', async () => {
    server.use(
      http.get('/v1/intel/calibration', ({ response }) =>
        response(200).json({
          scopes: [intelCalibration(), intelCalibration({ scope: 'precursor-active' })],
        }),
      ),
    );
    renderPanel(['intel.read']);
    expect(await screen.findByText('intel-event')).toBeInTheDocument();
    expect(screen.getByText('precursor-active')).toBeInTheDocument();
    expect(screen.getByTestId('intel-calibration-intel-event')).toBeInTheDocument();
  });

  it('is hidden for a principal without intel.read', () => {
    const { container } = renderPanel(['data.read']);
    expect(container).toBeEmptyDOMElement();
  });
});
