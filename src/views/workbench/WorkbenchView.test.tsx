import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { TokenStore } from '../../api/auth';
import type { ForesignalClient } from '../../api/client';
import { TokenStoreContext } from '../../api/useToken';
import type { RelationGraphProps } from '../../graph/RelationGraph';
import {
  commonDependencies,
  graphResult,
  GRAPH_INVESTIGATION_ID,
  REFS,
} from '../../graph/testing/graphFixtures';
import { investigation } from '../../intel/testing/fixtures';
import { json, standInApi, type Answer } from '../../intel/testing/standIn';
import { createStore, INITIAL_STATE, type AppState, type Store } from '../../state/store';
import { WorkbenchView } from './WorkbenchView';

// jsdom has no WebGL: the graph is a list of its nodes, each a button that selects it.
vi.mock('../../graph/RelationGraph', () => ({
  RelationGraph: ({ graph, selected, onSelect }: RelationGraphProps) => (
    <div
      data-testid="relation-graph"
      data-nodes={graph.nodes.length}
      data-edges={graph.edges.length}
    >
      {graph.nodes.map((node) => (
        <button
          key={node.ref}
          type="button"
          aria-pressed={node.ref === selected}
          onClick={() => onSelect(node.ref)}
        >
          {node.title}
        </button>
      ))}
    </div>
  ),
}));

const investigationPath = `/v1/investigations/${GRAPH_INVESTIGATION_ID}`;
const dossierPath = (ref: string) => `/v1/objects/${encodeURIComponent(ref)}/dossier`;

const answers = (): Record<string, Answer> => ({
  [`GET ${investigationPath}`]: () => json(investigation),
  'POST /v1/graph': () => json(graphResult),
  'POST /v1/graph/common-dependencies': () => json(commonDependencies),
  [`GET ${dossierPath(REFS.outage)}`]: () =>
    json({
      ref: REFS.outage,
      generatedAt: '2026-10-20T12:00:00Z',
      envelope: graphResult.nodes[2],
      sections: {},
    }),
});

/** Renders the workbench routes at a path, with stand-ins for the screens it opens. */
function renderAt(
  path: string,
  api: ForesignalClient,
  store: Store<AppState>,
  tokens?: TokenStore,
) {
  render(
    <TokenStoreContext.Provider value={tokens}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/analyst" element={<WorkbenchView api={api} store={store} />} />
          <Route
            path="/analyst/investigations/:id"
            element={<WorkbenchView kind="investigation" api={api} store={store} />}
          />
          <Route path="/intelligence/investigations/:id" element={<p>Full analysis</p>} />
          <Route path="/global" element={<p>Global dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </TokenStoreContext.Provider>,
  );
}

const graphBox = () => screen.findByTestId('relation-graph');

/** Opens the time window to all time, so the fixtures' dates hold whenever the tests run. */
async function allTime() {
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time window' }), 'All time');
}

describe('the Analyst Workbench', () => {
  it('graphs an investigation around itself and its items', async () => {
    const { api, asked, bodies } = standInApi(answers());
    renderAt(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`, api, createStore(INITIAL_STATE));
    expect(await screen.findByText(investigation.title, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Analyst Workbench');
    await graphBox();
    await allTime();
    // Six objects; the quake's self-loop is not drawn.
    expect(await graphBox()).toHaveAttribute('data-nodes', '6');
    expect(await graphBox()).toHaveAttribute('data-edges', '5');
    expect(asked).toContain(`GET ${investigationPath}`);
    expect(bodies[asked.indexOf('POST /v1/graph')]).toEqual({
      refs: [REFS.investigation, REFS.quake],
      depth: 1,
      limit: 2000,
    });
    expect(screen.getByTestId('graph-status')).toHaveTextContent('6 objects · 5 relations');
    expect(screen.getByRole('link', { name: 'Full analysis →' })).toHaveAttribute(
      'href',
      `/intelligence/investigations/${GRAPH_INVESTIGATION_ID}`,
    );
  });

  it('shows a selected node in the side panel, selects it app-wide, and walks its relations', async () => {
    const store = createStore(INITIAL_STATE);
    const { api } = standInApi(answers());
    renderAt(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`, api, store);
    await graphBox();
    await allTime();
    const side = screen.getByRole('complementary', { name: 'Selected entity' });
    expect(side).toHaveTextContent('Select an object in the graph');

    await userEvent.click(
      within(await graphBox()).getByRole('button', { name: 'Power outage near Santa Rosa' }),
    );
    expect(within(side).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Power outage near Santa Rosa',
    );
    expect(side).toHaveTextContent('intel-event');
    expect(side).toHaveTextContent('Key Evidence (3)');
    const evidence = within(side).getAllByRole('listitem');
    expect(evidence.map((row) => row.textContent)).toEqual([
      expect.stringContaining('depends-on'),
      expect.stringContaining('evidence-for'),
      expect.stringContaining('causes'),
    ]);
    expect(evidence[2]).toHaveTextContent('likely');
    expect(evidence[2]).toHaveTextContent('60%');
    await waitFor(() => expect(store.get('selection')?.id.ref).toBe(REFS.outage));

    await userEvent.click(within(side).getByRole('button', { name: 'Geysers Geothermal Plant' }));
    expect(within(side).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Geysers Geothermal Plant',
    );
    expect(
      within(await graphBox()).getByRole('button', { name: 'Geysers Geothermal Plant' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(side).getByRole('button', { name: 'Clear the selection' }));
    expect(side).toHaveTextContent('Select an object in the graph');
  });

  it('opens a selected object’s details on its own screen', async () => {
    const { api } = standInApi(answers());
    renderAt(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`, api, createStore(INITIAL_STATE));
    await graphBox();
    await allTime();
    await userEvent.click(
      within(await graphBox()).getByRole('button', { name: 'Power outage near Santa Rosa' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'View Entity Details →' }));
    expect(await screen.findByText('Global dashboard')).toBeInTheDocument();
  });

  it('filters by type on the client, and reads again for a depth or a relation type', async () => {
    const { api, asked, bodies } = standInApi(answers());
    renderAt(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`, api, createStore(INITIAL_STATE));
    await graphBox();
    await allTime();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Object type' }),
      'facility',
    );
    // The two seeds stay, with the plant.
    expect(await graphBox()).toHaveAttribute('data-nodes', '3');
    expect(asked.filter((line) => line === 'POST /v1/graph')).toHaveLength(1);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Depth' }), '2 hops');
    await waitFor(() => expect(asked.filter((line) => line === 'POST /v1/graph')).toHaveLength(2));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Relation type' }),
      'causes',
    );
    await waitFor(() => expect(asked.filter((line) => line === 'POST /v1/graph')).toHaveLength(3));
    const graphBodies = bodies.filter((_, i) => asked[i] === 'POST /v1/graph');
    expect(graphBodies[1]).toMatchObject({ depth: 2 });
    expect(graphBodies[2]).toMatchObject({ depth: 2, types: ['causes'] });
  });

  it('lists and tabulates the graph, and the search narrows the list', async () => {
    const { api } = standInApi(answers());
    renderAt(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`, api, createStore(INITIAL_STATE));
    await graphBox();
    await allTime();
    await userEvent.click(screen.getByRole('tab', { name: 'List View' }));
    const list = await screen.findByTestId('graph-list');
    const rows = within(list).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent('Power outage near Santa Rosa');
    expect(rows[0]).toHaveTextContent('causes 1, depends-on 1, evidence-for 1');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the graph' }), 'santa');
    expect(within(list).getAllByRole('row').slice(1)).toHaveLength(2);

    await userEvent.click(screen.getByRole('tab', { name: 'Matrix View' }));
    const matrix = await screen.findByTestId('graph-matrix');
    expect(within(matrix).getAllByRole('rowheader')).toHaveLength(6);
    expect(matrix.querySelector('[data-cell="causes"]')).not.toBeNull();
  });

  it('shows what objects share in the common-dependencies mode', async () => {
    const { api, asked, bodies } = standInApi(answers());
    const path = `/analyst?ref=${encodeURIComponent(REFS.quake)}&ref=${encodeURIComponent(REFS.outage)}`;
    renderAt(path, api, createStore(INITIAL_STATE));
    expect(await screen.findByText('2 objects')).toBeInTheDocument();
    await graphBox();
    await userEvent.click(screen.getByRole('button', { name: 'Common dependencies' }));
    const shared = await screen.findByTestId('common-dependencies');
    expect(shared).toHaveTextContent('Geysers Geothermal Plant');
    expect(shared).toHaveTextContent('facility · shared by 2 of 2');
    expect(shared).toHaveTextContent('likely');
    expect(await graphBox()).toHaveAttribute('data-nodes', '3');
    expect(bodies[asked.indexOf('POST /v1/graph/common-dependencies')]).toEqual({
      refs: [REFS.quake, REFS.outage],
    });
  });

  it('offers no common dependencies for fewer than two objects', async () => {
    const { api } = standInApi(answers());
    renderAt(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`, api, createStore(INITIAL_STATE));
    await graphBox();
    expect(screen.getByRole('button', { name: 'Common dependencies' })).toBeDisabled();
  });

  it('opens the analysis tabs from the tools rail, with the unbuilt tools disabled', async () => {
    const { api } = standInApi(answers());
    renderAt(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`, api, createStore(INITIAL_STATE));
    const rail = screen.getByRole('navigation', { name: 'Analysis tools' });
    expect(within(rail).getByRole('button', { name: 'Evidence Graph' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(rail).getByRole('button', { name: 'Correlation Finder' })).toBeDisabled();
    await userEvent.click(within(rail).getByRole('button', { name: 'Timeline' }));
    expect(await screen.findByText('Full analysis')).toBeInTheDocument();
  });

  it('opens the investigation’s own notes from the WORKSPACE rail', async () => {
    const notesPath = `/v1/objects/${encodeURIComponent(REFS.investigation)}/annotations`;
    const { api, asked } = standInApi({
      ...answers(),
      [`GET /v1/objects/${encodeURIComponent(REFS.investigation)}`]: () =>
        json(graphResult.nodes[0]),
      [`GET ${notesPath}`]: () =>
        json([
          {
            id: '01JA8Q00000000000000000N01',
            targetRef: REFS.investigation,
            kind: 'note',
            body: 'Brief the duty officer at 0800.',
            author: '01JA8Q00000000000000000P01',
            private: false,
            createdAt: '2026-10-18T12:00:00Z',
            updatedAt: '2026-10-18T12:00:00Z',
          },
        ]),
    });
    renderAt(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`, api, createStore(INITIAL_STATE));
    await graphBox();
    const rail = screen.getByRole('navigation', { name: 'Analysis tools' });
    await userEvent.click(within(rail).getByRole('button', { name: 'Notes' }));
    const notes = await screen.findByRole('region', { name: 'Analysis Notes' });
    expect(await within(notes).findByText('Brief the duty officer at 0800.')).toBeInTheDocument();
    // The investigation's envelope offers no annotate action here, so none is offered.
    expect(within(notes).queryByRole('button', { name: 'Add Note' })).not.toBeInTheDocument();
    expect(asked).toContain(`GET ${notesPath}?limit=500`);
  });

  it('says why an investigation did not open', async () => {
    const { api } = standInApi({
      [`GET ${investigationPath}`]: () =>
        json({ title: 'Not Found', status: 404, detail: 'No such investigation.' }, 404),
    });
    renderAt(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`, api, createStore(INITIAL_STATE));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('relation-graph')).not.toBeInTheDocument();
  });

  it('starts from the selected object or an investigation when nothing is open', async () => {
    const store = createStore(INITIAL_STATE);
    store.set('selection', {
      id: {
        layer: 'earthquake',
        kind: 'earthquake',
        source: 'usgs-earthquakes',
        externalId: 'nc1',
      },
      title: 'M 2.5',
      type: 'point',
      longitude: -122,
      latitude: 38,
      distance: 0,
    });
    const { api } = standInApi({
      'GET /v1/investigations': () => json({ items: [investigation], nextCursor: null }),
    });
    renderAt('/analyst', api, store);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Analyst Workbench');
    expect(screen.getByRole('link', { name: /Graph the selected object: M 2.5/ })).toHaveAttribute(
      'href',
      `/analyst?ref=${encodeURIComponent('record:usgs-earthquakes/nc1')}`,
    );
    expect(await screen.findByRole('link', { name: investigation.title })).toHaveAttribute(
      'href',
      `/analyst/investigations/${GRAPH_INVESTIGATION_ID}`,
    );
  });

  it('asks for a token when investigations cannot be listed', async () => {
    const { api } = standInApi({
      'GET /v1/investigations': () =>
        json({ title: 'Unauthorized', status: 401, detail: 'This operation needs a token.' }, 401),
    });
    renderAt('/analyst', api, createStore(INITIAL_STATE));
    expect(
      await screen.findByText('Listing investigations needs an access token. Add one in Settings.'),
    ).toBeInTheDocument();
  });

  it('does not ask for the investigations without a token, and says one is needed', async () => {
    const { api, asked } = standInApi({});
    const tokens = { get: () => null, set() {}, clear() {}, subscribe: () => () => {} };
    renderAt('/analyst', api, createStore(INITIAL_STATE), tokens);
    expect(
      await screen.findByText('Listing investigations needs an access token. Add one in Settings.'),
    ).toBeInTheDocument();
    expect(asked.filter((call) => call.includes('/v1/investigations'))).toEqual([]);
  });
});
