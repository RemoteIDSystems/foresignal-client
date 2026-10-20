import { render, screen, waitFor } from '@testing-library/react';
import { createForesignalClient } from '../../api/client';
import { http, MOCK_BASE_URL, server } from '../../api/testing/mock-server';
import { MapAttribution } from './attribution';
import {
  attributionHref,
  creditList,
  requiredAttributions,
  type Attribution,
} from './attributionModel';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

const shown: Attribution = {
  text: 'Map data © OpenStreetMap contributors',
  licence: 'ODbL-1.0',
  requiredDisplay: true,
  url: 'https://www.openstreetmap.org/copyright',
};
const notRequired: Attribution = {
  text: 'NOAA (public domain)',
  licence: 'US-PD',
  requiredDisplay: false,
};

describe('requiredAttributions', () => {
  it('keeps entries that require display, once per text', () => {
    const missing = { text: 'No field', licence: 'x' } as unknown as Attribution;
    expect(requiredAttributions([shown, notRequired, { ...shown, count: 3 }, missing])).toEqual([
      shown,
    ]);
  });
});

describe('creditList', () => {
  it('keeps every attribution, required or not, once per text and license, sorted by text', () => {
    const other = { ...notRequired, licence: 'CC0-1.0' };
    const lower = { text: 'acme feed', licence: 'x', requiredDisplay: false };
    expect(creditList([shown, notRequired, { ...shown }, other, lower])).toEqual([
      lower,
      shown,
      notRequired,
      other,
    ]);
  });

  it('links an attribution to its URL, else its terms, else its license page', () => {
    expect(attributionHref(shown)).toBe('https://www.openstreetmap.org/copyright');
    expect(
      attributionHref({ ...notRequired, termsUrl: 'https://t', licenceUrl: 'https://l' }),
    ).toBe('https://t');
    expect(attributionHref({ ...notRequired, licenceUrl: 'https://l' })).toBe('https://l');
    expect(attributionHref({ ...notRequired, url: null, termsUrl: null })).toBeUndefined();
  });
});

describe('MapAttribution', () => {
  it('shows the required attributions from getAttributions, linked', async () => {
    const queries: string[] = [];
    server.use(
      http.get('/v1/attributions', ({ request, response }) => {
        queries.push(new URL(request.url).search);
        return response(200).json({ attributions: [shown, notRequired], text: '' });
      }),
    );
    render(<MapAttribution api={api()} sources={['osm', 'mrms']} />);
    const line = await screen.findByTestId('map-attribution');
    expect(line).toHaveTextContent('Map data © OpenStreetMap contributors');
    expect(line).not.toHaveTextContent('NOAA');
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    );
    expect(queries).toEqual(['?source=osm%2Cmrms']);
  });

  it('renders nothing when no entry requires display', async () => {
    let asked = false;
    server.use(
      http.get('/v1/attributions', ({ response }) => {
        asked = true;
        return response(200).json({ attributions: [notRequired], text: '' });
      }),
    );
    render(<MapAttribution api={api()} />);
    await waitFor(() => expect(asked).toBe(true));
    expect(screen.queryByTestId('map-attribution')).toBeNull();
  });

  it('does not ask when there are no sources', () => {
    render(<MapAttribution api={api()} sources={[]} />);
    expect(screen.queryByTestId('map-attribution')).toBeNull();
  });
});
