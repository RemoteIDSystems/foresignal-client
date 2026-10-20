import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createForesignalClient } from '../../api/client';
import { http, MOCK_BASE_URL, server } from '../../api/testing/mock-server';
import type { Product } from './productApi';
import { ProductLegends } from './ProductLegends';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

const radar = {
  id: 'legend-test-radar',
  title: 'MRMS composite reflectivity',
  kind: 'raster',
  category: 'radar',
  source: 'mrms',
} as Product;

describe('ProductLegends', () => {
  it('shows a product’s legend bands, units and frame time, and plays its loop', async () => {
    server.use(
      http.get('/v1/products/{productId}/legend', ({ response }) =>
        response(200).json({
          styleId: 'nws-reflectivity',
          styleVersion: 1,
          type: 'discrete',
          unitsLabel: 'dBZ',
          stops: [
            { value: 5, color: '#04e9e7', label: '5' },
            { value: 50, color: '#fd0000', label: '50' },
          ],
          meaning: [{ min: 50, max: null, text: '≥ 50 dBZ: heavy rain, hail possible' }],
        }),
      ),
    );
    const toggled: string[] = [];
    const { rerender } = render(
      <ProductLegends
        api={api()}
        products={[radar]}
        layers={['legend-test-radar']}
        statuses={{ 'legend-test-radar': { state: 'ready', time: '2026-10-20T13:00:00Z' } }}
        looping={new Set()}
        onToggleLoop={(key) => toggled.push(key)}
      />,
    );
    const block = screen.getByRole('region', { name: 'MRMS composite reflectivity legend' });
    const bands = await within(block).findByTestId('legend-bar');
    expect(bands.querySelectorAll('i')).toHaveLength(2);
    expect(bands.parentElement).toHaveAttribute('title', '≥ 50 dBZ: heavy rain, hail possible');
    expect(block).toHaveTextContent('Oct 20 13:00Z');
    expect(block).toHaveTextContent('dBZ');
    await userEvent.click(
      within(block).getByRole('button', { name: 'Play the MRMS composite reflectivity loop' }),
    );
    expect(toggled).toEqual(['legend-test-radar']);

    rerender(
      <ProductLegends
        api={api()}
        products={[radar]}
        layers={['legend-test-radar']}
        statuses={{
          'legend-test-radar': {
            state: 'ready',
            time: '2026-10-20T13:00:00Z',
            loop: { state: 'playing', frames: 10, index: 3, time: '2026-10-20T12:30:00Z' },
          },
        }}
        looping={new Set(['legend-test-radar'])}
        onToggleLoop={() => {}}
      />,
    );
    expect(block).toHaveAttribute('data-loop-state', 'playing');
    expect(within(block).getByTestId('loop-frame')).toHaveTextContent('Frame 4 of 10');
    expect(block).toHaveTextContent('Oct 20 12:30Z');
  });

  it('renders nothing without product layers', () => {
    const { container } = render(
      <ProductLegends
        products={[radar]}
        layers={[]}
        statuses={{}}
        looping={new Set()}
        onToggleLoop={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
