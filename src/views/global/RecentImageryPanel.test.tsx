import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, standInApi } from '../../intel/testing/standIn';
import {
  BAND13,
  frame,
  GOES_VIS,
  NOW,
  SCENE,
  TRUECOLOR,
} from '../../imagery/testing/imageryFixtures';
import { NO_VIDEO } from '../../imagery/imageryView';
import { createStore, INITIAL_STATE } from '../../state/store';
import { RecentImageryPanel } from './BottomPanels';
import { RecordLayersContext, type RecordLayersValue } from './recordLayersContext';

/** A PNG answer. */
const png = () => new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 });

function renderPanel() {
  const { api } = standInApi({
    'GET /v1/products': () => json({ items: [TRUECOLOR, BAND13, GOES_VIS], nextCursor: null }),
    'GET /v1/products/goes-east-vis/frames/latest': () => json(frame('2026-10-20T11:50:00Z')),
    'GET /v1/products/goes-east-vis/image/20261020T115000Z~abcdef12.png': png,
    'GET /v1/sensors': () =>
      json({ from: '', to: '', items: [SCENE], note: 'Foresignal cannot task public satellites' }),
  });
  const store = createStore({
    ...INITIAL_STATE,
    viewport: { bbox: [-95.4, 29.2, -94.6, 30.1], zoom: 8 },
  } as typeof INITIAL_STATE);
  const value = { catalog: { status: 'loading' }, api, store } as unknown as RecordLayersValue;
  render(
    <RecordLayersContext.Provider value={value}>
      <RecentImageryPanel onClose={() => {}} />
    </RecordLayersContext.Provider>,
  );
}

describe('RecentImageryPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:picture'), revokeObjectURL: vi.fn() });
  });
  afterEach(() => vi.useRealTimers());

  it('shows the newest imagery over the view large, with a strip of the rest', async () => {
    renderPanel();
    await vi.waitFor(() =>
      expect(screen.getByTestId('global-imagery')).toHaveAttribute('data-count', '4'),
    );
    const main = screen.getByRole('button', {
      name: 'Open GOES-East visible (ABI band 2) full frame',
    });
    expect(main).toHaveTextContent('2026-10-20 11:50Z');
    const strip = screen.getByRole('list', { name: 'Imagery' });
    const thumbs = within(strip).getAllByRole('button');
    expect(thumbs).toHaveLength(4);
    expect(thumbs[0]).toHaveAttribute('aria-pressed', 'true');

    // A thumbnail shows that item large; the large one opens the full frame.
    await userEvent.click(thumbs[1]!);
    const shown = screen.getByRole('button', { name: /^Open GOES-East band 13 clean infrared/ });
    await userEvent.click(shown);
    expect(
      screen.getByRole('dialog', { name: 'GOES-East band 13 clean infrared (GIBS)' }),
    ).toBeInTheDocument();
  });

  it('narrows to satellite products, to scenes over the view, and says there is no video', async () => {
    renderPanel();
    await vi.waitFor(() =>
      expect(screen.getByTestId('global-imagery')).toHaveAttribute('data-count', '4'),
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Satellite' }));
    // The VIIRS true-color product is filed under imagery, not satellite.
    expect(screen.getByTestId('global-imagery')).toHaveAttribute('data-count', '3');
    await userEvent.click(screen.getByRole('tab', { name: 'Area Search' }));
    expect(screen.getByTestId('global-imagery')).toHaveAttribute('data-count', '1');
    await userEvent.click(screen.getByRole('tab', { name: 'Video' }));
    expect(screen.getByText(NO_VIDEO)).toBeInTheDocument();
  });
});
