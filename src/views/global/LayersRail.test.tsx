import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { buildCatalog, type KindSummary, type TileLayerSummary } from '../../map/records/catalog';
import type { RecordLayerStatus } from '../../map/records/recordLayers';
import fixture from '../../map/style/fixtures/overlay-style.json';
import { parseOverlayStyle, type MapStyle } from '../../map/style/parseStyle';
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
    layer('conflict-event', 'kind'),
    layer('aprs-station', 'kind'),
    layer('acled', 'source', 'ACLED'),
    layer('gdelt-events', 'source', 'GDELT 2.0 Events'),
  ],
  [
    { kind: 'conflict-event', currentCount: 1234, sources: ['gdelt-events'] },
    { kind: 'aprs-station', currentCount: 40, sources: [] },
  ] satisfies KindSummary[],
  model,
);

/** The rail inside a provider that keeps the enabled set, as the dashboard does. */
function Harness({
  initial,
  statuses = {},
  value,
}: {
  initial: string[];
  statuses?: Record<string, RecordLayerStatus>;
  value?: Partial<RecordLayersValue>;
}) {
  const [enabled, setEnabled] = useState(() => new Set(initial));
  const context: RecordLayersValue = {
    catalog: { status: 'ready', catalog },
    enabled,
    toggle: (id) =>
      setEnabled((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    clear: () => setEnabled(new Set()),
    statuses,
    ...value,
  };
  return (
    <RecordLayersContext.Provider value={context}>
      <LayersRail />
    </RecordLayersContext.Provider>
  );
}

/** The rail's visible layer rows: id, label text and checkbox state. */
function rows(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('li[data-layer]')].map((li) => ({
    id: li.dataset.layer,
    text: li.textContent,
    checked: (li.querySelector('input[type="checkbox"]') as HTMLInputElement).checked,
  }));
}

describe('LayersRail', () => {
  it('lists kind layers with prettified labels and counts, enabled ones checked', () => {
    const { container } = render(<Harness initial={['conflict-event']} />);
    expect(rows(container)).toEqual([
      { id: 'conflict-event', text: 'Conflict Event1,234', checked: true },
      { id: 'aprs-station', text: 'APRS Station40', checked: false },
      { id: 'aircraft', text: 'Aircraft0', checked: false },
    ]);
    expect(screen.getByRole('tab', { name: 'Kinds 3' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('layers-on')).toHaveTextContent('1 on');
  });

  it('sets back a layer with no records now', () => {
    const { container } = render(<Harness initial={[]} />);
    const label = (id: string) => container.querySelector(`li[data-layer="${id}"] label`);
    expect(label('aircraft')?.className).toMatch(/layerEmpty/);
    expect(label('aprs-station')?.className).not.toMatch(/layerEmpty/);
  });

  it('toggles a layer and turns all off', async () => {
    const { container } = render(<Harness initial={['conflict-event']} />);
    await userEvent.click(
      within(container.querySelector('li[data-layer="aircraft"]')!).getByRole('checkbox'),
    );
    expect(
      rows(container)
        .filter((row) => row.checked)
        .map((row) => row.id),
    ).toEqual(['conflict-event', 'aircraft']);
    expect(screen.getByTestId('layers-on')).toHaveTextContent('2 on');
    await userEvent.click(screen.getByRole('button', { name: 'Turn all off' }));
    expect(rows(container).some((row) => row.checked)).toBe(false);
    expect(screen.getByTestId('layers-on')).toHaveTextContent('No layers on');
  });

  it('switches to sources, named by the backend, and filters by label or id', async () => {
    const { container } = render(<Harness initial={[]} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Sources 2' }));
    expect(rows(container).map((row) => row.id)).toEqual(['gdelt-events', 'acled']);
    expect(container.querySelector('li[data-layer="acled"] label')).toHaveAttribute(
      'title',
      'acled',
    );
    await userEvent.type(screen.getByLabelText('Filter layers'), 'gdelt');
    expect(rows(container).map((row) => row.id)).toEqual(['gdelt-events']);
    await userEvent.clear(screen.getByLabelText('Filter layers'));
    await userEvent.type(screen.getByLabelText('Filter layers'), 'zzz');
    expect(screen.getByText('No layers match “zzz”.')).toBeInTheDocument();
  });

  it('marks an enabled layer that is loading, failed, or aggregated at this zoom', () => {
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
    const item = (id: string) => container.querySelector(`li[data-layer="${id}"]`) as HTMLElement;
    expect(item('conflict-event')).toHaveAttribute('data-layer-state', 'loading');
    expect(within(item('conflict-event')).getByLabelText('Loading')).toBeInTheDocument();
    expect(
      within(item('aprs-station')).getByLabelText('Did not load: HTTP 500'),
    ).toBeInTheDocument();
    expect(
      within(item('aircraft')).getByLabelText('Zoom in past 7 to see records'),
    ).toBeInTheDocument();
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
});
