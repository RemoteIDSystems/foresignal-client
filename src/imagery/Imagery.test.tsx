import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, standInApi } from '../intel/testing/standIn';
import { ImageryComparison } from './ImageryComparison';
import { ImageryViewer } from './ImageryViewer';
import {
  dossierItem,
  externalItem,
  NO_CHANGE_DETECTION,
  productItem,
  sceneItem,
} from './imageryView';
import { RecentImageryGrid } from './RecentImagery';
import {
  AREA,
  BAND13,
  DOSSIER_IMAGERY,
  frame,
  GOES_VIS,
  MEDIA,
  MEDIA_ID,
  NOW,
  SCENE,
  TRUECOLOR,
} from './testing/imageryFixtures';

/** A PNG answer. */
const png = () => new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 });

const ITEMS = [
  productItem(GOES_VIS, frame('2026-10-20T11:50:00Z'), AREA),
  externalItem(BAND13, AREA, NOW)!,
  sceneItem(SCENE),
];

beforeEach(() => {
  // jsdom has no object URLs; a fetched picture is drawn from this one.
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:picture'),
    revokeObjectURL: vi.fn(),
  });
});

describe('Recent Imagery', () => {
  it('lists each item with its source, time, resolution and band, and opens one', async () => {
    const { api } = standInApi({
      'GET /v1/products/goes-east-vis/image/20261020T115000Z~abcdef12.png': png,
    });
    const onOpen = vi.fn();
    render(
      <RecentImageryGrid
        api={api}
        imagery={{ status: 'ready', value: { items: ITEMS, failures: [] } }}
        onOpen={onOpen}
        title="Recent Imagery"
      />,
    );
    const list = screen.getByRole('list', { name: 'Recent imagery' });
    const tiles = within(list).getAllByRole('button');
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toHaveAccessibleName('GOES-East visible (ABI band 2), 2026-10-20 11:50Z');
    expect(tiles[2]).toHaveTextContent('ESA');
    expect(tiles[2]).toHaveTextContent('10 m · Optical');
    // A backend frame is fetched through the client and drawn from an object URL (a placeholder of
    // the same name shows while it loads).
    await waitFor(() =>
      expect(
        within(tiles[0]!).getByRole('img', { name: 'GOES-East visible (ABI band 2)' }),
      ).toHaveAttribute('src', 'blob:picture'),
    );
    // An external product's thumbnail is its tile, straight from the provider.
    expect(within(tiles[1]!).getByRole('img').querySelector('img')?.getAttribute('src')).toMatch(
      /^https:\/\/gibs\.earthdata\.nasa\.gov\/.+\/2026-10-20T11:20:00Z\/[^/]+\/5\/\d+\/\d+\.png$/,
    );
    await userEvent.click(tiles[2]!);
    expect(onOpen).toHaveBeenCalledWith(ITEMS[2]);
  });

  it('filters by band, and says why Change Detection is empty', async () => {
    render(
      <RecentImageryGrid
        api={undefined}
        imagery={{ status: 'ready', value: { items: ITEMS, failures: ['Products: HTTP 503'] } }}
        onOpen={() => {}}
      />,
    );
    const filters = screen.getByRole('group', { name: 'Imagery filters' });
    expect(
      within(filters)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['All', 'Optical', 'SAR', 'Thermal', 'Change Detection']);
    await userEvent.click(within(filters).getByRole('button', { name: 'Thermal' }));
    expect(screen.getByTestId('recent-imagery')).toHaveAttribute('data-count', '1');
    await userEvent.click(within(filters).getByRole('button', { name: 'SAR' }));
    expect(screen.getByText('No imagery of this kind over the view.')).toBeInTheDocument();
    await userEvent.click(within(filters).getByRole('button', { name: 'Change Detection' }));
    expect(screen.getByText(NO_CHANGE_DETECTION)).toBeInTheDocument();
    expect(screen.getByTestId('imagery-failures')).toHaveTextContent('Products: HTTP 503');
  });
});

describe('the full-frame viewer', () => {
  it('shows stored media at full size with its row, and opens its object', async () => {
    const { api, asked } = standInApi({
      [`GET /v1/media/${MEDIA_ID}`]: png,
      [`GET /v1/media/${MEDIA_ID}/meta`]: () => json(MEDIA),
    });
    const item = dossierItem(DOSSIER_IMAGERY.items[0]!);
    const onOpenObject = vi.fn();
    render(<ImageryViewer api={api} item={item} onClose={() => {}} onOpenObject={onOpenObject} />);
    const dialog = screen.getByRole('dialog', { name: 'NOAA 19 AVHRR thermal infrared' });
    await waitFor(() =>
      expect(within(dialog).getByRole('img', { name: item.title })).toHaveAttribute(
        'src',
        'blob:picture',
      ),
    );
    const facts = await within(dialog).findByTestId('media-facts');
    expect(facts).toHaveTextContent('2048 × 1536 px');
    expect(facts).toHaveTextContent('LicenseCC-BY-4.0');
    expect(asked).toContain(`GET /v1/media/${MEDIA_ID}`);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Open object →' }));
    expect(onOpenObject).toHaveBeenCalledWith(DOSSIER_IMAGERY.items[0]!.ref);
  });

  it('says when a scene has no picture', () => {
    render(<ImageryViewer api={undefined} item={sceneItem(SCENE)} onClose={() => {}} />);
    expect(screen.getByText('The backend holds no picture of this scene.')).toBeInTheDocument();
  });
});

describe('the Imagery Comparison', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  function renderComparison() {
    const stand = standInApi({
      'GET /v1/products': () => json({ items: [GOES_VIS, TRUECOLOR], nextCursor: null }),
      'GET /v1/products/goes-east-vis/frames': () =>
        json({
          items: [frame('2026-10-20T11:45:00Z'), frame('2026-10-20T11:50:00Z', '12345678')],
          nextCursor: null,
        }),
      'GET /v1/products/goes-east-vis/image/20261020T114500Z~abcdef12.png': png,
      'GET /v1/products/goes-east-vis/image/20261020T115000Z~12345678.png': png,
    });
    render(<ImageryComparison api={stand.api} area={AREA} title="Imagery Comparison" />);
    return stand;
  }

  it('opens a daily true-color product a week apart, and swipes between the dates', async () => {
    renderComparison();
    const swipe = await screen.findByTestId('swipe-compare');
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveValue(TRUECOLOR.id);
    expect(screen.getByRole('combobox', { name: 'Before' })).toHaveValue(
      '2026-10-12T00:00:00.000Z',
    );
    expect(screen.getByRole('combobox', { name: 'After' })).toHaveValue('2026-10-19T00:00:00.000Z');
    expect(swipe).toHaveTextContent('2026-10-12');
    expect(swipe).toHaveTextContent('2026-10-19');
    // Each side is a 3 × 3 mosaic of the provider's tiles for its day.
    const before = within(screen.getByTestId('swipe-before')).getByRole('img');
    expect(before.querySelectorAll('img')).toHaveLength(9);
    // GIBS tile URLs carry the tile matrix set between the day and the zoom.
    expect(before.querySelector('img')?.getAttribute('src')).toMatch(
      /\/2026-10-12\/GoogleMapsCompatible_Level\d+\/7\//,
    );
    expect(screen.getByTestId('swipe-before')).toHaveStyle({ clipPath: 'inset(0 50% 0 0)' });

    fireEvent.change(screen.getByRole('slider', { name: 'Swipe position' }), {
      target: { value: '30' },
    });
    expect(swipe).toHaveAttribute('data-position', '30');
    expect(screen.getByTestId('swipe-before')).toHaveStyle({ clipPath: 'inset(0 70% 0 0)' });
    // A drag on a picture is the swipe's, not the browser's image drag (which would cancel it).
    expect(fireEvent.dragStart(before)).toBe(false);

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Before' }),
      '2026-10-18T00:00:00.000Z',
    );
    expect(swipe).toHaveTextContent('2026-10-18');
  });

  it('compares a backend product’s frames, rendered for the view', async () => {
    const { asked } = renderComparison();
    await screen.findByTestId('swipe-compare');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Product' }), GOES_VIS.id);
    const swipe = await screen.findByTestId('swipe-compare');
    await vi.waitFor(() => expect(swipe).toHaveTextContent('2026-10-20 11:45Z'));
    expect(swipe).toHaveTextContent('2026-10-20 11:50Z');
    await vi.waitFor(() =>
      expect(asked).toContainEqual(
        expect.stringMatching(
          /^GET \/v1\/products\/goes-east-vis\/image\/20261020T115000Z~12345678\.png\?.*width=1024/,
        ),
      ),
    );
  });

  it('shows the change metrics as not supplied, and the run action disabled with why', async () => {
    renderComparison();
    const metrics = await screen.findByTestId('change-metrics');
    expect(metrics).toHaveTextContent('Building count—');
    expect(metrics).toHaveTextContent('Disturbed area—');
    expect(metrics).toHaveTextContent('Confidence—');
    const run = screen.getByRole('button', { name: /Run Change Detection/ });
    expect(run).toBeDisabled();
    expect(run).toHaveAttribute('title', NO_CHANGE_DETECTION);
  });

  it('says when no product can be compared', async () => {
    const { api } = standInApi({
      'GET /v1/products': () => json({ items: [], nextCursor: null }),
    });
    render(<ImageryComparison api={api} area={AREA} />);
    expect(await screen.findByText(/no enabled satellite or imagery product/)).toBeInTheDocument();
  });
});
