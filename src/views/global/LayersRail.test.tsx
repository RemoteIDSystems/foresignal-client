import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  buildCatalog,
  withViewCounts,
  type KindSummary,
  type TileLayerSummary,
} from '../../map/records/catalog';
import type { RecordLayerStatus } from '../../map/records/recordLayers';
import fixture from '../../map/style/fixtures/overlay-style.json';
import { parseOverlayStyle, type MapStyle } from '../../map/style/parseStyle';
import { productEntries } from '../../map/products/productCatalog';
import type { Product } from '../../map/products/productApi';
import { LayersRail } from './LayersRail';
import { RecordLayersContext, type RecordLayersValue } from './recordLayersContext';

const model = parseOverlayStyle(fixture as unknown as MapStyle);

const layer = (id: string, type: 'kind' | 'source', name = id): TileLayerSummary => ({
  id,
  type,
  name,
  tilejson: `http://localhost:8080/v1/tiles/${id}.json`,
  aggBelowZoom: id === 'aircraft' ? 7 : null,
});

const catalog = buildCatalog(
  [
    layer('aircraft', 'kind'),
    layer('aviation-hazard', 'kind'),
    layer('conflict-event', 'kind'),
    layer('aprs-station', 'kind'),
    layer('acled', 'source', 'ACLED'),
    layer('gdelt-events', 'source', 'GDELT 2.0 Events'),
    layer('ucdp-ged', 'source', 'UCDP GED'),
  ],
  [
    { kind: 'conflict-event', currentCount: 1234, sources: ['gdelt-events', 'acled'] },
    { kind: 'aprs-station', currentCount: 40, sources: ['aprs-is'] },
  ] satisfies KindSummary[],
  model,
);

/** The rail inside a provider that keeps the enabled kinds and hidden sources, as the dashboard does. */
function Harness({
  initial,
  statuses = {},
  value,
}: {
  initial: string[];
  statuses?: Record<string, RecordLayerStatus>;
  value?: Partial<RecordLayersValue>;
}) {
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(() => new Set(initial));
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const flip = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };
  const context: RecordLayersValue = {
    catalog: { status: 'ready', catalog },
    enabled,
    toggle: (id) => setEnabled((current) => flip(current, id)),
    setKinds: (ids, on) =>
      setEnabled((current) => {
        const next = new Set(current);
        for (const id of ids) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
    clear: () => setEnabled(new Set()),
    hiddenSources: hidden,
    toggleSource: (id) => setHidden((current) => flip(current, id)),
    showAllSources: () => setHidden(new Set()),
    statuses,
    products: { entries: [], enabled: new Set(), setKeys: () => {}, statuses: {} },
    ...value,
  };
  return (
    <RecordLayersContext.Provider value={context}>
      <LayersRail />
    </RecordLayersContext.Provider>
  );
}

/** The category rows: id, text and checkbox state ('on', 'some' or 'off'). */
function categories(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('li[data-category]')].map((li) => [
    li.dataset.category,
    li.querySelector('label')?.textContent,
    li.dataset.categoryState,
  ]);
}

/** A category's checkbox. */
const categoryBox = (container: HTMLElement, id: string) =>
  container.querySelector(`li[data-category="${id}"] input[type="checkbox"]`) as HTMLInputElement;

describe('LayersRail', () => {
  it('lists the categories with their icons, summed counts and checkbox state', () => {
    const { container } = render(<Harness initial={['conflict-event', 'aircraft']} />);
    expect(categories(container)).toEqual([
      ['aircraft', 'Aircraft (ADS-B)', 'some'],
      ['rf', 'RF / Spectrum', 'off'],
      ['conflicts', 'Conflicts / Security', 'on'],
    ]);
    expect(categoryBox(container, 'aircraft').indeterminate).toBe(true);
    expect(categoryBox(container, 'conflicts').checked).toBe(true);
    const conflicts = container.querySelector('li[data-category="conflicts"]') as HTMLElement;
    expect(within(conflicts).getByText('1,234')).toBeInTheDocument();
    // Collapsed until opened: no kind rows yet.
    expect(container.querySelectorAll('li[data-layer]')).toHaveLength(0);
    expect(screen.getByTestId('layers-on')).toHaveTextContent('2 on');
  });

  it('turns a whole category on, then off, from its checkbox', async () => {
    const { container } = render(<Harness initial={['aircraft']} />);
    await userEvent.click(categoryBox(container, 'aircraft'));
    expect(screen.getByTestId('layers-on')).toHaveTextContent('2 on');
    expect(categoryBox(container, 'aircraft').checked).toBe(true);
    await userEvent.click(categoryBox(container, 'aircraft'));
    expect(screen.getByTestId('layers-on')).toHaveTextContent('No layers on');
  });

  it('opens a category to its kinds, and toggles one', async () => {
    const { container } = render(<Harness initial={[]} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Show the kinds in Aircraft (ADS-B)' }),
    );
    const rows = [...container.querySelectorAll<HTMLElement>('li[data-layer]')];
    expect(rows.map((li) => li.textContent)).toEqual(['Aircraft0', 'Aviation Hazard0']);
    // No records now: set back, still switchable.
    expect(rows[0]?.querySelector('label')?.className).toMatch(/layerEmpty/);
    await userEvent.click(within(rows[1]!).getByRole('checkbox'));
    expect(categoryBox(container, 'aircraft').indeterminate).toBe(true);
    await userEvent.click(
      screen.getByRole('button', { name: 'Hide the kinds in Aircraft (ADS-B)' }),
    );
    expect(container.querySelectorAll('li[data-layer]')).toHaveLength(0);
  });

  it('filters kinds by label, opening the categories that match', async () => {
    const { container } = render(<Harness initial={[]} />);
    await userEvent.type(screen.getByLabelText('Filter layers'), 'aprs');
    expect(categories(container).map(([id]) => id)).toEqual(['rf']);
    expect(container.querySelector('li[data-layer="aprs-station"]')).not.toBeNull();
    await userEvent.clear(screen.getByLabelText('Filter layers'));
    await userEvent.type(screen.getByLabelText('Filter layers'), 'zzz');
    expect(screen.getByText('No layers match “zzz”.')).toBeInTheDocument();
  });

  it('marks a drawn kind that is loading, failed, or aggregated at this zoom', async () => {
    const { container } = render(
      <Harness
        initial={['conflict-event', 'aprs-station', 'aircraft']}
        statuses={{
          'conflict-event': { state: 'loading', features: 0, tiles: 0 },
          'aprs-station': { state: 'error', features: 0, tiles: 0, message: 'HTTP 500' },
          aircraft: { state: 'aggregated', features: 0, tiles: 0 },
        }}
      />,
    );
    const category = (id: string) =>
      container.querySelector(`li[data-category="${id}"]`) as HTMLElement;
    expect(within(category('conflicts')).getByLabelText('Loading')).toBeInTheDocument();
    expect(within(category('rf')).getByLabelText('A layer did not load')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Filter layers'), 'a');
    const kind = (id: string) => container.querySelector(`li[data-layer="${id}"]`) as HTMLElement;
    expect(kind('aprs-station')).toHaveAttribute('data-layer-state', 'error');
    expect(within(kind('aprs-station')).getByLabelText('Did not load: HTTP 500')).toBeVisible();
    expect(
      within(kind('aircraft')).getByLabelText(
        'Hexagon counts below zoom 7; zoom in to see records',
      ),
    ).toBeVisible();
  });

  it('shows the records in view once the viewport summary is in, else the records now', () => {
    const { container, rerender } = render(<Harness initial={[]} />);
    const conflicts = () => container.querySelector('li[data-category="conflicts"]') as HTMLElement;
    expect(within(conflicts()).getByTitle('Records now')).toHaveTextContent('1,234');
    rerender(
      <Harness
        initial={[]}
        value={{
          catalog: {
            status: 'ready',
            catalog: withViewCounts(catalog, new Map([['conflict-event', 56]])),
          },
        }}
      />,
    );
    expect(within(conflicts()).getByTitle('Records in view')).toHaveTextContent('56');
    // A kind the summary does not list has none in view, and is set back.
    const rf = container.querySelector('li[data-category="rf"]') as HTMLElement;
    expect(within(rf).getByTitle('Records in view')).toHaveTextContent('0');
    expect(rf.querySelector('div')?.className).toMatch(/layerEmpty/);
  });

  it('filters sources within the enabled kinds, live ones first, and shows them all again', async () => {
    const { container } = render(<Harness initial={['conflict-event']} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Filters' }));
    const sources = () =>
      [...container.querySelectorAll<HTMLElement>('li[data-source]')].map((li) => [
        li.dataset.source,
        (li.querySelector('input') as HTMLInputElement).checked,
      ]);
    // Both supply records now (by name), then ucdp-ged, which only the style links to the kind.
    expect(sources()).toEqual([
      ['acled', true],
      ['gdelt-events', true],
      ['ucdp-ged', true],
    ]);
    expect(screen.getByTestId('sources-shown')).toHaveTextContent('All 3 shown');
    await userEvent.click(
      within(container.querySelector('li[data-source="acled"]') as HTMLElement).getByRole(
        'checkbox',
      ),
    );
    expect(sources()[0]).toEqual(['acled', false]);
    expect(screen.getByTestId('sources-shown')).toHaveTextContent('2 of 3 shown');
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByTestId('sources-shown')).toHaveTextContent('All 3 shown');
  });

  it('asks for a layer before offering sources', async () => {
    render(<Harness initial={[]} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Filters' }));
    expect(screen.getByText('Turn a layer on to choose its sources.')).toBeInTheDocument();
  });

  it('shows the loading and error states of the layer list', () => {
    const { rerender } = render(
      <Harness initial={[]} value={{ catalog: { status: 'loading' } }} />,
    );
    expect(screen.getByText('Loading layers…')).toBeInTheDocument();
    rerender(
      <Harness initial={[]} value={{ catalog: { status: 'error', error: new Error('x') } }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The layer list did not load.');
  });

  it('says it needs a backend outside a page that provides layers', () => {
    render(<LayersRail />);
    expect(screen.getByText('Layers need a backend connection.')).toBeInTheDocument();
  });

  it('lists a category’s products, folds away the unavailable, and toggles a wind field’s facets', async () => {
    const weather = buildCatalog(
      [layer('space-weather-alert', 'kind')],
      [{ kind: 'space-weather-alert', currentCount: 3, sources: ['swpc'] }],
      model,
    );
    const product = (id: string, kind: string, category: string, health = 'healthy') =>
      ({
        id,
        title: id.toUpperCase(),
        kind,
        category,
        source: id,
        coverage: id === 'gfs' ? 'global' : 'CONUS',
        status: { health, stale: false, reason: health === 'disabled' ? 'source disabled' : null },
      }) as Product;
    const entries = productEntries([
      product('mrms-reflectivity', 'raster', 'radar'),
      product('gfs', 'field', 'model'),
      product('hrrr-smoke', 'raster', 'model', 'disabled'),
    ]);
    function ProductHarness() {
      const [enabled, setEnabled] = useState<ReadonlySet<string>>(() => new Set());
      const [kinds, setKinds] = useState<ReadonlySet<string>>(() => new Set());
      const setKeys = (keys: readonly string[], on: boolean) =>
        setEnabled((current) => {
          const next = new Set(current);
          for (const key of keys) {
            if (on) next.add(key);
            else next.delete(key);
          }
          return next;
        });
      return (
        <Harness
          initial={[]}
          value={{
            catalog: { status: 'ready', catalog: weather },
            enabled: kinds,
            setKinds: (ids, on) => setKinds(on ? new Set(ids) : new Set()),
            products: { entries, enabled, setKeys, statuses: {} },
          }}
        />
      );
    }
    const { container } = render(<ProductHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Show the kinds in Weather' }));
    const rows = () =>
      [...container.querySelectorAll<HTMLElement>('li[data-product]')].map((li) => [
        li.dataset.product,
        li.dataset.productState,
      ]);
    expect(rows()).toEqual([
      ['mrms-reflectivity', 'off'],
      ['gfs', 'off'],
      ['hrrr-smoke', 'unavailable'],
    ]);
    expect(screen.getByText('1 unavailable')).toBeInTheDocument();
    expect(screen.getByText('CONUS')).toBeInTheDocument();

    // The category's checkbox covers its kinds and its curated products.
    await userEvent.click(categoryBox(container, 'weather'));
    expect(rows()[0]).toEqual(['mrms-reflectivity', 'ready']);
    expect(screen.getByTestId('layers-on')).toHaveTextContent('2 on');

    // A wind field turns on as speed and particles; its facets toggle one by one.
    const gfs = container.querySelector('li[data-product="gfs"]') as HTMLElement;
    await userEvent.click(within(gfs).getByRole('checkbox'));
    const pressed = () =>
      within(gfs)
        .getAllByRole('button')
        .map((button) => [button.textContent, button.getAttribute('aria-pressed')]);
    expect(pressed()).toEqual([
      ['Speed', 'true'],
      ['Barbs', 'false'],
      ['Particles', 'true'],
    ]);
    await userEvent.click(within(gfs).getByRole('button', { name: 'Barbs' }));
    expect(pressed()[1]).toEqual(['Barbs', 'true']);
    await userEvent.click(within(gfs).getByRole('checkbox'));
    expect(within(gfs).queryAllByRole('button')).toHaveLength(0);
  });
});
