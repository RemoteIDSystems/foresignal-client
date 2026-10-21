import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { createForesignalClient } from '../../api/client';
import type { RecordHit } from '../../map/records/recordPicking';
import type { Dossier } from '../../objects/objectApi';
import { createStore, INITIAL_STATE, type AppState } from '../../state/store';
import { RecordLayersContext, type RecordLayersValue } from './recordLayersContext';
import { RelatedEntitiesPanel } from './RelatedEntitiesPanel';
import { SelectedEntityPanel } from './SelectedEntityPanel';

const REF = 'record:usgs-earthquakes/nc1';

const near = (title: string, km: number, status?: string) => ({
  relation: { type: 'near' } as never,
  direction: 'out' as const,
  object: { ref: `facility:${title}`, type: 'facility', title, ...(status && { status }) },
  distanceKm: km,
});

const dossierWith = (related: Dossier['sections']['related']): Dossier => ({
  ref: REF,
  generatedAt: '2026-10-20T12:00:00Z',
  envelope: { ref: REF, type: 'record', title: 'M 4.1 - Somewhere' },
  sections: { overview: { status: 'ok', fields: {} }, related },
});

/** The paths the stand-in backend was asked for, and what it answers each with. */
let asked: string[] = [];
let answers: Record<string, () => unknown>;

const newApi = () =>
  createForesignalClient({
    baseUrl: 'http://api.test',
    retry: false,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      asked.push(path);
      const answer = Object.entries(answers).find(([suffix]) => path.endsWith(suffix))?.[1];
      return answer
        ? new Response(JSON.stringify(answer()), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ETag: '"e1"' },
          })
        : new Response(JSON.stringify({ title: 'Not found', status: 404 }), { status: 404 });
    },
  });

const quake: RecordHit = {
  id: { layer: 'earthquake', kind: 'earthquake', source: 'usgs-earthquakes', externalId: 'nc1' },
  type: 'point',
  longitude: 0,
  latitude: 0,
  distance: 0,
};

/** Renders the panel (and, optionally, the Selected Entity panel beside it) for a selection. */
function renderPanel(selection: RecordHit | undefined, withEntityPanel = false) {
  const selected: string[] = [];
  const value = {
    catalog: { status: 'loading' },
    selection,
    api: newApi(),
    store: createStore<AppState>(INITIAL_STATE),
    selectRef: async (ref: string) => {
      selected.push(ref);
    },
  } as unknown as RecordLayersValue;
  // The Selected Entity panel links to other screens, so it needs a router.
  render(
    <MemoryRouter>
      <RecordLayersContext.Provider value={value}>
        <RelatedEntitiesPanel />
        {withEntityPanel && <SelectedEntityPanel onClose={() => {}} />}
      </RecordLayersContext.Provider>
    </MemoryRouter>,
  );
  return selected;
}

beforeEach(() => {
  asked = [];
  answers = {};
});

describe('RelatedEntitiesPanel', () => {
  it('asks for a selection first', () => {
    renderPanel(undefined);
    expect(screen.getByText('Select an object to see what is related to it.')).toBeInTheDocument();
  });

  it('lists the dossier’s four classes, sharing the Selected Entity panel’s request, and selects a row', async () => {
    answers = {
      '/dossier': () =>
        dossierWith({
          status: 'ok',
          nearby: [
            near('Norfolk Intl Airport', 45, 'operational'),
            near('Port of Virginia', 38, 'congestion alert'),
          ],
          operational: [],
          infrastructure: [
            {
              relation: { type: 'depends-on', label: 'likely' } as never,
              direction: 'out',
              object: { ref: 'facility:grid', type: 'facility', title: 'Coastal substation' },
            },
          ],
          historical: [],
        }),
    };
    const selected = renderPanel(quake, true);
    const list = await screen.findByRole('list', { name: 'Related entities' });
    await within(list).findByText('Norfolk Intl Airport');
    expect(asked).toEqual(['/v1/objects/record%3Ausgs-earthquakes%2Fnc1/dossier']);
    const rows = within(list).getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Norfolk Intl AirportFacility45 km Operational');
    expect(rows[1]).toHaveTextContent('Congestion Alert');
    expect(screen.getByTestId('related-entities')).toHaveAttribute('data-counts', '2 0 1 0');
    await userEvent.click(screen.getByRole('tab', { name: 'Operational' }));
    expect(screen.getByText('Nothing operational for this object.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Infrastructure' }));
    expect(screen.getByTestId('related-entities')).toHaveTextContent('Coastal substation');
    expect(screen.getByTestId('related-entities')).toHaveTextContent('(likely)');
    await userEvent.click(screen.getByRole('button', { name: /Coastal substation/ }));
    expect(selected).toEqual(['facility:grid']);
  });

  it('reads the full list when the dossier cut its lists short, and sorts it into the classes', async () => {
    answers = {
      '/dossier': () =>
        dossierWith({ status: 'ok', truncated: true, nearby: [near('First only', 5)] }),
      '/related': () => ({
        ref: REF,
        items: [
          near('Far', 90),
          near('Close', 2),
          {
            relation: { type: 'precedes' },
            direction: 'in',
            object: { ref: 'record:x/1', type: 'record', title: 'M 6.0 in 1989' },
          },
        ],
      }),
    };
    renderPanel(quake);
    const panel = screen.getByTestId('related-entities');
    await within(panel).findByText('Close');
    expect(panel).toHaveAttribute('data-source', 'list');
    expect(asked[1]).toBe('/v1/objects/record%3Ausgs-earthquakes%2Fnc1/related');
    expect(
      within(panel)
        .getAllByRole('button')
        .map((row) => row.title),
    ).toEqual(['Close', 'Far']);
    await userEvent.click(screen.getByRole('tab', { name: 'Historical' }));
    expect(panel).toHaveTextContent('M 6.0 in 1989');
  });

  it('says what the related section’s status says', async () => {
    answers = { '/dossier': () => dossierWith({ status: 'not-installed' }) };
    renderPanel(quake);
    expect(
      await screen.findByText('Related objects is not installed on this server.'),
    ).toBeInTheDocument();
  });
});
