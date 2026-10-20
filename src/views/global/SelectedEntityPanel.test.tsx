import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { createForesignalClient } from '../../api/client';
import type { RecordHit } from '../../map/records/recordPicking';
import type { Dossier } from '../../objects/objectApi';
import { createStore, INITIAL_STATE, type AppState } from '../../state/store';
import { RecordLayersContext, type RecordLayersValue } from './recordLayersContext';
import { SelectedEntityPanel } from './SelectedEntityPanel';

const REF = 'record:usgs-earthquakes/nc75452571';

const dossier: Dossier = {
  ref: REF,
  generatedAt: '2026-10-20T17:50:19Z',
  envelope: {
    ref: REF,
    type: 'record',
    title: 'M 2.5 - 2 km NW of The Geysers, CA',
    status: 'active',
    time: { observedAt: '2026-10-20T16:52:22.950Z' },
    geometry: { type: 'Point', coordinates: [-122.77, 38.79] } as never,
    actions: [
      { id: 'add-to-workspace', method: 'POST', href: '/v1/workspaces/x/items', scope: 'read' },
      { id: 'annotate', label: 'Annotate', method: 'POST', href: '/v1/annotations', scope: 'read' },
      { id: 'dismiss', method: 'POST', href: '/v1/x/dismiss', scope: 'agent' },
    ],
  },
  sections: {
    overview: {
      status: 'ok',
      fields: { place: '2 km NW of The Geysers, CA', mag: 2.5, depth: 0.47 },
    },
    imagery: { status: 'unavailable', message: 'The imagery catalog did not answer in time.' },
    forecast: { status: 'not-installed' },
    impacts: { status: 'empty', items: [] },
    related: {
      status: 'ok',
      nearby: [
        {
          relation: { type: 'near' } as never,
          direction: 'out',
          object: { ref: 'record:x/1', type: 'record', title: 'Geysers power plant' },
          distanceKm: 3.4,
        },
      ],
    },
    timeline: {
      status: 'ok',
      items: [{ at: '2026-10-20T16:32:23.805Z', kind: 'version', title: 'Version 4' }],
    },
    analysis: { status: 'empty' },
  },
};

/** What the stand-in backend was asked for. */
let asked: { path: string; ifNoneMatch: string | null }[] = [];
let answer: () => Response;

/** A fresh client per check, so the dossier cache (one per client) starts empty. */
const newApi = () =>
  createForesignalClient({
    baseUrl: 'http://api.test',
    retry: false,
    fetch: async (request) => {
      asked.push({
        path: new URL(request.url).pathname + new URL(request.url).search,
        ifNoneMatch: request.headers.get('If-None-Match'),
      });
      return answer();
    },
  });
let api = newApi();

const json = (body: unknown, status = 200, etag?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(etag && { ETag: etag }) },
  });

const quake: RecordHit = {
  id: {
    layer: 'earthquake',
    source: 'usgs-earthquakes',
    externalId: 'nc75452571',
    kind: 'earthquake',
  },
  title: 'M 2.5 - 2 km NW of The Geysers, CA',
  type: 'point',
  longitude: -122.77,
  latitude: 38.79,
  distance: 0,
};

function renderPanel(
  selection: RecordHit | undefined,
  store = createStore<AppState>(INITIAL_STATE),
) {
  const value = {
    catalog: { status: 'loading' },
    selection,
    api,
    store,
  } as unknown as RecordLayersValue;
  render(
    <MemoryRouter>
      <RecordLayersContext.Provider value={value}>
        <SelectedEntityPanel onClose={() => {}} />
      </RecordLayersContext.Provider>
    </MemoryRouter>,
  );
  return store;
}

beforeEach(() => {
  api = newApi();
  asked = [];
  answer = () => json(dossier, 200, '"d-1"');
});

describe('SelectedEntityPanel', () => {
  it('asks to select something when nothing is selected', () => {
    renderPanel(undefined);
    expect(screen.getByText('Select a record on the map to see its dossier.')).toBeInTheDocument();
  });

  it('says a hexagon cell is many records', () => {
    renderPanel({
      id: { layer: 'earthquake', count: 1234 },
      type: 'cell',
      longitude: 0,
      latitude: 0,
      distance: 0,
    });
    expect(screen.getByText(/1,234 records counted together here/)).toBeInTheDocument();
    expect(asked).toEqual([]);
  });

  it('shows the record’s dossier: header, key fields, each section by its status, and actions', async () => {
    renderPanel(quake);
    expect(screen.getByText('Loading the dossier…')).toBeInTheDocument();
    expect(await screen.findByTestId('entity-facts')).toBeInTheDocument();
    expect(asked[0]?.path).toBe('/v1/objects/record%3Ausgs-earthquakes%2Fnc75452571/dossier');
    expect(screen.getByTestId('entity-title')).toHaveTextContent(
      'M 2.5 - 2 km NW of The Geysers, CA',
    );
    const panel = screen.getByTestId('entity-panel');
    expect(panel).toHaveTextContent('ID: nc75452571');
    expect(panel).toHaveTextContent('active');
    const facts = within(screen.getByTestId('entity-facts'));
    expect(facts.getByText('Location')).toBeInTheDocument();
    expect(facts.getByText('38.8°N, 122.8°W')).toBeInTheDocument();
    expect(facts.getByText('2026-10-20 16:52Z')).toBeInTheDocument();
    // The unavailable imagery says why, where the image would be; the timeline still renders.
    expect(screen.getByTestId('entity-no-image')).toHaveTextContent(
      'The imagery catalog did not answer in time.',
    );
    expect(screen.getByTestId('section-recent-updates')).toHaveTextContent('Version 4');
    // Two actions as buttons, the third under the overflow; none carried out by this client yet.
    const actions = within(screen.getByTestId('entity-actions'));
    expect(actions.getByRole('button', { name: 'Add to Workspace' })).toBeDisabled();
    expect(actions.getByRole('button', { name: 'Annotate' })).toBeInTheDocument();
    expect(actions.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    await userEvent.click(actions.getByRole('button', { name: 'More actions' }));
    expect(actions.getByRole('button', { name: 'Dismiss' })).toHaveAttribute('data-scope', 'agent');
    // The tabs: a section not installed, an empty one, and the related objects with their count.
    await userEvent.click(screen.getByRole('tab', { name: 'Forecast' }));
    expect(screen.getByTestId('section-forecast')).toHaveTextContent(
      'Forecast is not installed on this server.',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Impacts' }));
    expect(screen.getByTestId('section-impacts')).toHaveTextContent('No impacts for this object.');
    await userEvent.click(screen.getByRole('tab', { name: 'Related (1)' }));
    expect(screen.getByTestId('section-related-objects')).toHaveTextContent('Geysers power plant');
    expect(screen.getByTestId('section-related-objects')).toHaveTextContent('3 km');
  });

  it('reads the dossier again, by its ETag, when the stream says its kind changed', async () => {
    const store = renderPanel(quake);
    await screen.findByTestId('entity-facts');
    answer = () => new Response(null, { status: 304 });
    act(() => store.set('layer:earthquake', { changes: 1, live: 0, resyncs: 0, at: 5 }));
    await act(async () => {});
    expect(asked.map((request) => request.ifNoneMatch)).toEqual([null, '"d-1"']);
    expect(screen.getByTestId('entity-title')).toHaveTextContent('M 2.5');
  });

  it('reads the dossier as of the time machine’s instant', async () => {
    const store = createStore<AppState>(INITIAL_STATE);
    store.set('time', { mode: 'asOf', asOf: '2026-10-20T10:00:00Z' });
    renderPanel(quake, store);
    await screen.findByTestId('entity-facts');
    expect(asked[0]?.path).toBe(
      '/v1/objects/record%3Ausgs-earthquakes%2Fnc75452571/dossier?asOf=2026-10-20T10%3A00%3A00Z',
    );
  });

  it('says when the dossier did not load', async () => {
    answer = () =>
      json({ type: 'about:blank', title: 'Not found', status: 404, detail: 'No such object' }, 404);
    renderPanel({ ...quake, id: { ...quake.id, externalId: 'gone' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('The dossier did not load');
  });
});
