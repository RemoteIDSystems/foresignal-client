import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import {
  changes,
  eventMember,
  investigation,
  investigationEnvelope,
  INVESTIGATION_ID,
  member,
  situation,
  SITUATION_ID,
  timeline,
} from '../../intel/testing/fixtures';
import {
  hypothesisSet,
  indicators,
  informationValue,
  matrix,
  otherSet,
  SET_ID,
  setEnvelope,
} from '../../intel/testing/hypothesisFixtures';
import { json, standInApi, type Answer } from '../../intel/testing/standIn';
import { AnalysisView } from './AnalysisView';

const situationPath = `/v1/situations/${SITUATION_ID}`;
const setPath = `/v1/hypotheses/sets/${SET_ID}`;
const page = (items: unknown[]) => () => json({ items, nextCursor: null });

const answers = (): Record<string, Answer> => ({
  [`GET ${situationPath}`]: () => json(situation),
  [`GET ${situationPath}/members`]: page([member, eventMember]),
  [`GET ${situationPath}/timeline`]: page(timeline),
  [`GET ${situationPath}/changes`]: () => json(changes),
  [`GET /v1/objects/situation%3A${SITUATION_ID}/related`]: () =>
    json({ ref: `situation:${SITUATION_ID}`, items: [] }),
  'GET /v1/hypotheses/sets': page([otherSet, hypothesisSet]),
  [`GET ${setPath}`]: () => json(hypothesisSet),
  [`GET /v1/hypotheses/sets/${otherSet.id}`]: () => json(otherSet),
  [`GET /v1/hypotheses/sets/${otherSet.id}/information-value`]: () =>
    json({ ...informationValue, setId: otherSet.id, indicators: [] }),
  'GET /v1/indicators': (request) =>
    new URL(request.url).searchParams.get('setId') === SET_ID ? page(indicators)() : page([])(),
  [`GET ${setPath}/information-value`]: () => json(informationValue),
  [`GET ${setPath}/matrix`]: () => json(matrix),
  [`GET /v1/objects/hypothesis-set%3A${SET_ID}`]: () => json(setEnvelope),
  [`POST ${setPath}/hypotheses`]: () => json(hypothesisSet.hypotheses[0], 201),
});

/** Renders the analysis routes at a path. */
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
      </Routes>
    </MemoryRouter>,
  );
}

describe('the Hypotheses tab', () => {
  it('lists the active set’s hypotheses by probability, with trend, indicators and confidence', async () => {
    const { api, asked } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=hypotheses`, api);
    const panel = await screen.findByTestId('hypotheses-panel');
    expect(panel).toHaveTextContent(hypothesisSet.question);
    expect(asked.find((line) => line.startsWith('GET /v1/hypotheses/sets?'))).toContain(
      `situationId=${SITUATION_ID}`,
    );
    const rows = await within(panel).findAllByTestId('hypothesis-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('H1Geothermal injection explains the swarm');
    expect(within(rows[0]!).getByTestId('hypothesis-probability')).toHaveTextContent('72% ↑');
    expect(within(rows[0]!).getByTestId('hypothesis-probability')).toHaveAttribute(
      'title',
      '+6 pts since the last revision',
    );
    expect(within(rows[1]!).getByTestId('hypothesis-probability')).toHaveTextContent('21% ↓');
    expect(within(rows[2]!).getByTestId('hypothesis-probability')).toHaveTextContent('7%');
    await waitFor(() =>
      expect(within(rows[0]!).getByTestId('hypothesis-indicators')).toHaveTextContent(
        'Indicators: 2/3 (1 for, 0 against)',
      ),
    );
    expect(within(rows[1]!).getByTestId('hypothesis-indicators')).toHaveTextContent(
      'Indicators: 1/2 (0 for, 1 against)',
    );
    expect(within(rows[2]!).queryByTestId('hypothesis-indicators')).toBeNull();
    expect(rows[0]).toHaveTextContent('Confidence: High');
    expect(panel).toHaveTextContent('Confidence: Moderate');
    // The header's Information Value comes from the active set: 0.25 of 0.8 nats is High.
    expect(await screen.findByRole('img', { name: 'Information value High' })).toBeInTheDocument();
  });

  it('ranks the pending indicators and lists the indicators and assumptions', async () => {
    const { api } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=hypotheses`, api);
    const ranked = await screen.findByRole('list', {
      name: 'Pending indicators by information value',
    });
    const items = within(ranked).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('#1Hypocenters migrate deeper than 5 km');
    expect(items[0]).toHaveTextContent('Detection 80%');
    expect(items[1]).toHaveTextContent('Collection gap');
    expect(screen.getByTestId('information-value')).toHaveTextContent('Uncertainty now 0.80 nats');
    expect(await screen.findByTestId('indicators')).toHaveTextContent('Indicators (4)');
    expect(screen.getByText('The injection logs are complete.')).toBeInTheDocument();
  });

  it('opens the ACH matrix: rows heaviest first, ratings, and the least inconsistent', async () => {
    const { api } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=hypotheses`, api);
    await userEvent.click(
      await screen.findByRole('button', { name: 'View hypothesis analysis →' }),
    );
    const table = await screen.findByRole('table', { name: 'ACH matrix' });
    const rows = within(table).getAllByTestId('ach-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('The largest event is M 4.6 with no aftershock decay');
    expect(rows[0]).toHaveTextContent('II');
    expect(rows[1]).toHaveTextContent('Non-diagnostic');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers.slice(3)).toEqual(['H2 · 21%', 'H1 · 72%', 'H3 · 7%']);
    const scores = within(table).getByTestId('ach-scores');
    expect(scores).toHaveTextContent('-8.0');
    expect(within(scores).getByText('Least inconsistent').closest('td')).toHaveTextContent('0.0');
    expect(screen.getByTestId('ach-matrix')).toHaveTextContent('Audit view');
    await userEvent.click(
      within(screen.getByTestId('ach-matrix')).getByRole('button', { name: 'Hypotheses' }),
    );
    expect(await screen.findByTestId('hypotheses-panel')).toBeInTheDocument();
  });

  it('adds a hypothesis where the set’s envelope offers it, then reads the set again', async () => {
    const { api, asked, bodies } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=hypotheses`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Add hypothesis' }));
    const form = screen.getByRole('form', { name: 'Add hypothesis' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Label' }), 'Fluid migration');
    await userEvent.type(
      within(form).getByRole('textbox', { name: 'Statement' }),
      'Natural fluids at depth.',
    );
    await userEvent.clear(within(form).getByRole('spinbutton', { name: 'Prior (%)' }));
    await userEvent.type(within(form).getByRole('spinbutton', { name: 'Prior (%)' }), '15');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(asked).toContain(`POST ${setPath}/hypotheses`));
    expect(bodies[asked.indexOf(`POST ${setPath}/hypotheses`)]).toEqual({
      label: 'Fluid migration',
      statement: 'Natural fluids at depth.',
      type: 'outcome',
      prior: 0.15,
      priorBasis: { type: 'operator', rationale: null },
    });
    await waitFor(() => expect(asked.filter((line) => line === `GET ${setPath}`)).toHaveLength(2));
    expect(screen.queryByRole('form', { name: 'Add hypothesis' })).toBeNull();
  });

  it('offers no addition when the set’s envelope does not', async () => {
    const stand = answers();
    stand[`GET /v1/objects/hypothesis-set%3A${SET_ID}`] = () =>
      json({ ...setEnvelope, actions: [] });
    const { api, asked } = standInApi(stand);
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=hypotheses`, api);
    await screen.findByTestId('hypotheses-panel');
    await waitFor(() => expect(asked).toContain(`GET /v1/objects/hypothesis-set%3A${SET_ID}`));
    expect(screen.queryByRole('button', { name: 'Add hypothesis' })).toBeNull();
  });

  it('switches to another set by its question', async () => {
    const { api } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=hypotheses`, api);
    const chooser = await screen.findByRole('combobox', { name: 'Key question' });
    expect(within(chooser).getAllByRole('option')).toHaveLength(2);
    await userEvent.selectOptions(chooser, otherSet.id);
    expect(await screen.findByText('This set has no hypotheses yet.')).toBeInTheDocument();
    expect(await screen.findByText('No indicators are pending.')).toBeInTheDocument();
  });

  it('reads the sets an investigation links, and says when there are none', async () => {
    const investigationAnswers = (links: string[]): Record<string, Answer> => ({
      [`GET /v1/investigations/${INVESTIGATION_ID}`]: () =>
        json({ ...investigation, hypothesisSetIds: links }),
      [`GET /v1/objects/investigation%3A${INVESTIGATION_ID}`]: () => json(investigationEnvelope),
      [`GET /v1/objects/investigation%3A${INVESTIGATION_ID}/related`]: () =>
        json({ ref: `investigation:${INVESTIGATION_ID}`, items: [] }),
      [`GET ${setPath}`]: () => json(hypothesisSet),
    });
    const linked = standInApi(investigationAnswers([SET_ID]));
    renderAt(`/intelligence/investigations/${INVESTIGATION_ID}?tab=hypotheses`, linked.api);
    expect(await screen.findAllByTestId('hypothesis-row')).toHaveLength(3);
    expect(linked.asked.some((line) => line.startsWith('GET /v1/hypotheses/sets?'))).toBe(false);
  });

  it('says so when no set is linked', async () => {
    const { api } = standInApi({
      [`GET /v1/investigations/${INVESTIGATION_ID}`]: () =>
        json({ ...investigation, hypothesisSetIds: [] }),
      [`GET /v1/objects/investigation%3A${INVESTIGATION_ID}`]: () => json(investigationEnvelope),
    });
    renderAt(`/intelligence/investigations/${INVESTIGATION_ID}?tab=hypotheses`, api);
    expect(
      await screen.findByText('No hypothesis sets are linked to this analysis.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('analysis-information')).toHaveTextContent('Not assessed');
  });
});
