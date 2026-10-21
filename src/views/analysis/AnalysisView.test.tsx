import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import {
  changes,
  intelEvent,
  investigation,
  investigationEnvelope,
  INVESTIGATION_ID,
  member,
  eventMember,
  situation,
  SITUATION_ID,
  timeline,
} from '../../intel/testing/fixtures';
import { json, standInApi, type Answer } from '../../intel/testing/standIn';
import { AnalysisView } from './AnalysisView';

const situationPath = `/v1/situations/${SITUATION_ID}`;
const investigationPath = `/v1/investigations/${INVESTIGATION_ID}`;

const situationAnswers = (): Record<string, Answer> => ({
  [`GET ${situationPath}`]: () => json(situation),
  [`GET ${situationPath}/members`]: () => json({ items: [member, eventMember], nextCursor: null }),
  [`GET ${situationPath}/timeline`]: () => json({ items: timeline, nextCursor: null }),
  [`GET ${situationPath}/changes`]: () => json(changes),
  [`GET /v1/objects/situation%3A${SITUATION_ID}/related`]: () =>
    json({ ref: `situation:${SITUATION_ID}`, items: [] }),
  [`GET /v1/intel/events/${eventMember.ref}`]: () => json(intelEvent),
});

const investigationAnswers = (): Record<string, Answer> => ({
  [`GET ${investigationPath}`]: () => json(investigation),
  [`GET /v1/objects/investigation%3A${INVESTIGATION_ID}`]: () => json(investigationEnvelope),
  [`GET /v1/objects/investigation%3A${INVESTIGATION_ID}/related`]: () =>
    json({ ref: `investigation:${INVESTIGATION_ID}`, items: [] }),
  [`POST ${investigationPath}/items`]: () => json(investigation.items![0], 201),
  [`DELETE ${investigationPath}/items/item-1`]: () => new Response(null, { status: 204 }),
});

/** Renders the analysis routes at a path, with a Global stand-in to land on. */
function renderAt(path: string, api: ForesignalClient) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/intelligence/situations/:id"
          element={<AnalysisView kind="situation" api={api} />}
        />
        <Route
          path="/intelligence/investigations/:id"
          element={<AnalysisView kind="investigation" api={api} />}
        />
        <Route path="/global" element={<p>Global dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the situation full-analysis view', () => {
  it('shows the header, the tabs and the Overview from the situation, its changes and timeline', async () => {
    const { api, asked } = standInApi(situationAnswers());
    renderAt(`/intelligence/situations/${SITUATION_ID}`, api);
    const header = await screen.findByTestId('analysis-header');
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent(situation.title);
    expect(header).toHaveTextContent('active');
    expect(header).toHaveTextContent('Started 2026-10-01');
    expect(header).toHaveTextContent('US-CA');
    expect(within(header).getByRole('img', { name: 'Confidence 72% high' })).toBeInTheDocument();
    expect(header).toHaveTextContent('2026-10-18 15:01Z');
    expect(screen.getByRole('tab', { name: 'Entities (2)' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Related (0)' })).toBeInTheDocument();
    // A tab carries its count once known ("Evidence (2)"), as the mock's do.
    for (const name of ['Overview', 'Full Analysis', 'Timeline', 'Map', 'Evidence', 'Hypotheses']) {
      expect(screen.getByRole('tab', { name: new RegExp(`^${name}( \\(|$)`) })).toBeInTheDocument();
    }
    const changed = screen.getByTestId('what-changed');
    expect(changed).toHaveTextContent('Status emerging → active');
    expect(changed).toHaveTextContent('Area +312 km²');
    expect(screen.getByTestId('situation-overview')).toHaveTextContent(
      'Two signal families over 17 days',
    );
    // The timeline and changes start 30 days back, to the hour.
    const timelineAsk = asked.find((line) => line.startsWith(`GET ${situationPath}/timeline`))!;
    expect(new URLSearchParams(timelineAsk.split('?')[1]).get('from')).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/,
    );
  });

  it('lists the timeline, the members, and an intelligence event’s detail', async () => {
    const { api } = standInApi(situationAnswers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=timeline`, api);
    const rows = await screen.findByTestId('timeline-rows');
    expect(within(rows).getAllByRole('listitem')).toHaveLength(3);
    expect(rows).toHaveTextContent('Power outage near Santa Rosa');
    await userEvent.click(screen.getByRole('tab', { name: 'Entities (2)' }));
    const table = screen.getByRole('table', { name: 'Members' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'core');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'all');
    await userEvent.click(screen.getByRole('button', { name: 'Power outage near Santa Rosa' }));
    const detail = await screen.findByTestId('event-detail');
    expect(await within(detail).findByText(/Outage reports cluster/)).toBeInTheDocument();
    expect(detail).toHaveTextContent('Confidence 64% (moderate)');
  });

  it('names the prompt that fills a tab this one does not', async () => {
    const { api } = standInApi(situationAnswers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=reports`, api);
    expect(await screen.findByTestId('pending-tab')).toHaveTextContent(
      'This tab is filled by a later prompt.',
    );
  });

  it('says so when the situation does not exist', async () => {
    const { api } = standInApi({});
    renderAt(`/intelligence/situations/${SITUATION_ID}`, api);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This situation does not exist, or is not shared with you.',
    );
  });
});

describe('the investigation workspace', () => {
  it('shows the investigation header and its items, and adds and removes items', async () => {
    const { api, asked, bodies } = standInApi(investigationAnswers());
    renderAt(`/intelligence/investigations/${INVESTIGATION_ID}?tab=entities`, api);
    const header = await screen.findByTestId('analysis-header');
    expect(header).toHaveTextContent('Tropical Storm Florence');
    expect(header).toHaveTextContent('ID: INV-2026-0001');
    expect(header).toHaveTextContent('TLP:AMBER');
    expect(screen.getByTestId('analysis-confidence')).toHaveTextContent('Not assessed');
    const table = await screen.findByRole('table', { name: 'Items' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);

    await userEvent.type(screen.getByRole('textbox', { name: 'Item reference' }), 'usgs/nc2');
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(asked).toContain(`POST ${investigationPath}/items`));
    expect(bodies[asked.indexOf(`POST ${investigationPath}/items`)]).toEqual({
      itemType: 'record',
      ref: 'usgs/nc2',
    });
    // The investigation is read again after the change.
    await waitFor(() =>
      expect(asked.filter((line) => line === `GET ${investigationPath}`)).toHaveLength(2),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove “M 4.6 - 10 km NE of The Geysers”' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));
    await waitFor(() => expect(asked).toContain(`DELETE ${investigationPath}/items/item-1`));
  });

  it('is read-only when the envelope offers no item actions', async () => {
    const answers = investigationAnswers();
    answers[`GET /v1/objects/investigation%3A${INVESTIGATION_ID}`] = () =>
      json({ ...investigationEnvelope, actions: [] });
    const { api } = standInApi(answers);
    renderAt(`/intelligence/investigations/${INVESTIGATION_ID}?tab=entities`, api);
    expect(await screen.findByTestId('items-tab')).toHaveTextContent(
      'Adding and removing items needs the agent or admin scope',
    );
    expect(screen.queryByRole('form', { name: 'Add item' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  it('asks for a token when the backend refuses', async () => {
    const { api } = standInApi({
      [`GET ${investigationPath}`]: () => json({ title: 'Unauthorized', status: 401 }, 401),
    });
    renderAt(`/intelligence/investigations/${INVESTIGATION_ID}`, api);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Opening an investigation needs an access token. Add one in Settings.',
    );
  });
});
