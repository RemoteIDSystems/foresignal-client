import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import { FINDING_ID } from '../../intel/testing/analyticsFixtures';
import {
  assessment,
  ASSESSMENT_ID,
  bundle,
  newerAssessment,
  run,
  RUN_ID,
  situationEnvelope,
  template,
} from '../../intel/testing/assessmentFixtures';
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
import { json, standInApi, type Answer } from '../../intel/testing/standIn';
import { AnalysisView } from './AnalysisView';
import { RUN_POLL_MS } from './AssessmentTab';

const situationPath = `/v1/situations/${SITUATION_ID}`;
const page = (items: unknown[]) => () => json({ items, nextCursor: null });

const answers = (): Record<string, Answer> => ({
  [`GET ${situationPath}`]: () => json(situation),
  [`GET ${situationPath}/members`]: page([member, eventMember]),
  [`GET ${situationPath}/timeline`]: page(timeline),
  [`GET ${situationPath}/changes`]: () => json(changes),
  [`GET /v1/objects/situation%3A${SITUATION_ID}/related`]: () =>
    json({ ref: `situation:${SITUATION_ID}`, items: [] }),
  [`GET ${situationPath}/assessments`]: page([assessment]),
  [`GET /v1/assessments/${ASSESSMENT_ID}`]: () => json(assessment),
  [`GET /v1/assessments/${ASSESSMENT_ID}/bundle`]: () => json(bundle),
  [`GET /v1/objects/situation%3A${SITUATION_ID}`]: () => json(situationEnvelope),
  'GET /v1/prompt-templates/situation-analyst': () => json(template),
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

const open = `/intelligence/situations/${SITUATION_ID}?tab=analysis`;

describe('the Full Analysis tab', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the latest assessment’s model, time and text origin, and the summary', async () => {
    const { api } = standInApi(answers());
    renderAt(open, api);
    const meta = await screen.findByTestId('assessment-meta');
    expect(meta).toHaveTextContent('claude-opus-5-5 (effort medium)');
    expect(meta).toHaveTextContent('2026-10-18 16:00Z');
    expect(meta).toHaveTextContent('on-demand');
    expect(meta).toHaveTextContent('Text originmixed');
    const tab = screen.getByTestId('ai-tab');
    expect(within(tab).getByText('at a raised rate')).toBeInTheDocument();
    const takeaways = within(tab).getAllByTestId('takeaway');
    expect(takeaways).toHaveLength(2);
    expect(takeaways[0]).toHaveTextContent('72% · likely');
    expect(takeaways[0]).toHaveTextContent('Confidence: Moderate');
    expect(takeaways[0]).toHaveTextContent('llm');
    expect(takeaways[0]).toHaveTextContent('Changed: Injection volumes rose.');
    expect(takeaways[1]).toHaveTextContent('deterministic');
    expect(screen.getByTestId('ai-analysis')).toHaveTextContent(
      'Automated analysis; verify before acting.',
    );
  });

  it('shows each tab’s sections and says when one is missing', async () => {
    const { api } = standInApi(answers());
    renderAt(open, api);
    await screen.findByTestId('assessment-meta');
    const strip = screen.getByRole('tablist', { name: 'AI Analysis sections' });
    await userEvent.click(within(strip).getByRole('tab', { name: 'What Changed' }));
    expect(screen.getAllByTestId('ai-tab')[0]!.querySelectorAll('li')).toHaveLength(2);
    await userEvent.click(within(strip).getByRole('tab', { name: 'Outlook' }));
    expect(screen.getByTestId('ai-tab')).toHaveTextContent(
      'This assessment has no Outlook section.',
    );
    await userEvent.click(within(strip).getByRole('tab', { name: 'More' }));
    expect(within(screen.getByTestId('ai-tab')).getByRole('table')).toHaveTextContent('Injection');
    expect(screen.getByTestId('ai-tab')).toHaveTextContent('Hypotheses');
  });

  it('opens a cited object, from the bundle or a takeaway', async () => {
    const { api } = standInApi(answers());
    renderAt(open, api);
    const cited = await screen.findByTestId('cited-objects');
    expect(await within(cited).findAllByRole('listitem')).toHaveLength(2);
    expect(cited).toHaveTextContent('Earthquake count rose in Northern California');
    await userEvent.click(
      within(cited).getByRole('button', { name: /M 4.6 - 10 km NE of The Geysers/ }),
    );
    expect(await screen.findByText('Global dashboard')).toBeInTheDocument();
  });

  it('opens a citation inside a takeaway', async () => {
    const { api } = standInApi(answers());
    renderAt(open, api);
    const takeaways = await screen.findAllByTestId('takeaway');
    await userEvent.click(
      within(takeaways[0]!).getByRole('button', { name: `finding:${FINDING_ID}` }),
    );
    expect(await screen.findByText('Global dashboard')).toBeInTheDocument();
  });

  it('shows the prompt templates', async () => {
    const { api, asked } = standInApi(answers());
    renderAt(open, api);
    await userEvent.click(await screen.findByRole('button', { name: 'View prompt' }));
    const drawer = await screen.findByTestId('prompt-drawer');
    expect(await within(drawer).findByText(template.text)).toBeInTheDocument();
    expect(drawer).toHaveTextContent('situation-analyst@3 · analyst');
    expect(asked).toContain('GET /v1/prompt-templates/situation-analyst?version=3');
  });

  it('re-runs where offered, follows the run, then shows the new assessment', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stand = answers();
    let polls = 0;
    let finished = false;
    stand[`POST ${situationPath}/assessment`] = () => json(run('queued'), 202);
    stand[`GET /v1/analysis/runs/${RUN_ID}`] = () => {
      polls += 1;
      finished = polls >= 2;
      return json(run(finished ? 'ok' : 'running'));
    };
    stand[`GET ${situationPath}/assessments`] = () =>
      json({ items: finished ? [newerAssessment, assessment] : [assessment], nextCursor: null });
    stand[`GET /v1/assessments/${newerAssessment.id}`] = () => json(newerAssessment);
    stand[`GET /v1/assessments/${newerAssessment.id}/bundle`] = () =>
      json({ ...bundle, assessment: newerAssessment });
    const { api, asked } = standInApi(stand);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt(open, api);
    await user.click(await screen.findByRole('button', { name: 'Re-run' }));
    expect(await screen.findByTestId('rerun-progress')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_MS));
    await waitFor(() => expect(polls).toBe(1));
    expect(screen.getByTestId('rerun-progress')).toHaveTextContent('running');
    await act(() => vi.advanceTimersByTimeAsync(RUN_POLL_MS));
    expect(await screen.findByText('Assessment ok.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('assessment-meta')).toHaveTextContent('2026-10-18 17:00Z'),
    );
    expect(asked).toContain(`POST ${situationPath}/assessment`);
  });

  it('offers no re-run when the envelope does not', async () => {
    const stand = answers();
    stand[`GET /v1/objects/situation%3A${SITUATION_ID}`] = () =>
      json({ ...situationEnvelope, actions: [] });
    const { api, asked } = standInApi(stand);
    renderAt(open, api);
    await screen.findByTestId('assessment-meta');
    await waitFor(() => expect(asked).toContain(`GET /v1/objects/situation%3A${SITUATION_ID}`));
    expect(screen.queryByRole('button', { name: 'Re-run' })).toBeNull();
  });

  it('says when there is no assessment, and that investigations have none', async () => {
    const stand = answers();
    stand[`GET ${situationPath}/assessments`] = page([]);
    const empty = standInApi(stand);
    renderAt(open, empty.api);
    expect(
      await screen.findByText('No assessment of this situation has been made yet.'),
    ).toBeInTheDocument();
  });

  it('says an investigation has no assessments of its own', async () => {
    const { api } = standInApi({
      [`GET /v1/investigations/${INVESTIGATION_ID}`]: () => json(investigation),
      [`GET /v1/objects/investigation%3A${INVESTIGATION_ID}`]: () => json(investigationEnvelope),
    });
    renderAt(`/intelligence/investigations/${INVESTIGATION_ID}?tab=analysis`, api);
    expect(await screen.findByTestId('assessment-tab')).toHaveTextContent(
      'an investigation has none of its own',
    );
  });
});
