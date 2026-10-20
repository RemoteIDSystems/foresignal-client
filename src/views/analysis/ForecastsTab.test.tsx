import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import type { EChartProps } from '../../ui/charts/EChart';
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
  calibration,
  emptyHistory,
  forecasts,
  outageDetail,
  outageHistory,
  outageQuestion,
  questions,
  scorecard,
} from '../../intel/testing/forecastFixtures';
import { json, standInApi, type Answer } from '../../intel/testing/standIn';
import { AnalysisView } from './AnalysisView';

// jsdom has no canvas: the chart is a box that says what it was asked to draw.
vi.mock('../../ui/charts/EChart', () => ({
  EChart: ({ option, label, testId }: EChartProps) => (
    <div
      role="img"
      aria-label={label}
      data-testid={testId}
      data-series={Array.isArray(option.series) ? option.series.length : 0}
    />
  ),
}));

const situationPath = `/v1/situations/${SITUATION_ID}`;
const outagePath = `/v1/forecasts/questions/${outageQuestion.id}`;
const page = (items: unknown[]) => () => json({ items, nextCursor: null });

/** Answers a question's history: the outage's, or an empty one. */
const history: Answer = (request) => {
  const id = new URL(request.url).pathname.split('/')[4]!;
  return json(id === outageQuestion.id ? outageHistory : emptyHistory(id));
};

const answers = (): Record<string, Answer> => {
  const out: Record<string, Answer> = {
    [`GET ${situationPath}`]: () => json(situation),
    [`GET ${situationPath}/members`]: page([member, eventMember]),
    [`GET ${situationPath}/timeline`]: page(timeline),
    [`GET ${situationPath}/changes`]: () => json(changes),
    [`GET /v1/objects/situation%3A${SITUATION_ID}/related`]: () =>
      json({ ref: `situation:${SITUATION_ID}`, items: [] }),
    'GET /v1/forecasts/questions': page(questions),
    [`GET ${outagePath}`]: () => json(outageDetail),
    [`GET ${outagePath}/forecasts`]: page(forecasts),
    'GET /v1/forecasts/scorecard': () => json(scorecard),
    'GET /v1/forecasts/calibration': () => json(calibration),
  };
  for (const question of questions)
    out[`GET /v1/forecasts/questions/${question.id}/history`] = history;
  return out;
};

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

describe('the Forecasts tab', () => {
  it('lists the questions due within three months with probability, trend and sparkline', async () => {
    const { api, asked } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=forecasts`, api);
    const panel = await screen.findByTestId('forecasts-panel');
    expect(within(panel).getByRole('tab', { name: '3 months' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const rows = await within(panel).findAllByTestId('forecast-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(outageQuestion.title);
    expect(rows[0]).toHaveTextContent(`By ${outageQuestion.resolveBy.slice(0, 10)}`);
    await waitFor(() =>
      expect(within(rows[0]!).getByTestId('forecast-probability')).toHaveTextContent('74% ↑'),
    );
    const sparkline = within(rows[0]!).getByRole('img', {
      name: `${outageQuestion.title}: probability by day`,
    });
    expect(sparkline).toHaveAttribute('data-points', '10');
    expect(sparkline).toHaveAttribute('data-tone', 'danger');
    expect(within(rows[1]!).getByTestId('forecast-probability')).toHaveTextContent('8%');
    expect(within(rows[1]!).getByRole('img')).toHaveAttribute('data-tone', 'info');
    const read = new URL(
      `http://api.test${asked.find((line) => line.startsWith('GET /v1/forecasts/questions?'))!.slice(4)}`,
    ).searchParams;
    expect(read.get('linked')).toBe(`situation:${SITUATION_ID}`);
    expect(read.getAll('status')).toEqual(['open']);
    expect(read.get('dueBefore')).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(panel).toHaveTextContent('View forecast ledger →');
    expect(panel).toHaveTextContent('Probability trend:HighMediumLow');
  });

  it('changes the horizon', async () => {
    const { api } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=forecasts`, api);
    const panel = await screen.findByTestId('forecasts-panel');
    expect(await within(panel).findAllByTestId('forecast-row')).toHaveLength(2);
    await userEvent.click(within(panel).getByRole('tab', { name: '1 month' }));
    await waitFor(() => expect(within(panel).getAllByTestId('forecast-row')).toHaveLength(1));
    await userEvent.click(within(panel).getByRole('tab', { name: '6 months' }));
    await waitFor(() => expect(within(panel).getAllByTestId('forecast-row')).toHaveLength(3));
  });

  it('opens a question: its criteria, every forecaster’s line, and the latest forecasts', async () => {
    const { api } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=forecasts`, api);
    await userEvent.click(await screen.findByRole('button', { name: outageQuestion.title }));
    const detail = await screen.findByTestId('question-detail');
    expect(await within(detail).findByText(outageDetail.resolutionCriteria)).toBeInTheDocument();
    expect(detail).toHaveTextContent('74% (likely)');
    expect(await within(detail).findByTestId('question-history')).toHaveAttribute(
      'data-series',
      '2',
    );
    const latest = await within(detail).findAllByRole('listitem');
    expect(latest).toHaveLength(3);
    expect(latest[0]).toHaveTextContent('Ensemble');
    expect(latest[2]).toHaveTextContent('Base Rate');
    expect(latest[2]).toHaveTextContent('50%');
    expect(detail).toHaveTextContent('the utility has announced shutoffs');
    await userEvent.click(within(detail).getByRole('button', { name: 'Close question' }));
    expect(screen.queryByTestId('question-detail')).toBeNull();
  });

  it('opens the forecast ledger: the scorecard and the calibration curve', async () => {
    const { api } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=forecasts`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'View forecast ledger →' }));
    const table = await screen.findByRole('table', { name: 'Scorecard' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Ensemble');
    expect(rows[0]).toHaveTextContent('0.142');
    expect(rows[0]).toHaveTextContent('0.210 vs. base-rate');
    expect(rows[1]).toHaveTextContent('insufficient');
    const chart = await screen.findByTestId('calibration-chart');
    expect(chart).toHaveAttribute('data-series', '2');
    expect(screen.getByTestId('calibration')).toHaveTextContent('n = 34 · bins · sharpness 0.120');
    expect(screen.getByTestId('calibration-insufficient')).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByTestId('forecast-ledger')).getByRole('button', { name: 'Forecasts' }),
    );
    expect(await screen.findByTestId('forecasts-panel')).toBeInTheDocument();
  });

  it('reads the questions an investigation links, and says when none are due', async () => {
    const stand: Record<string, Answer> = {
      [`GET /v1/investigations/${INVESTIGATION_ID}`]: () =>
        json({ ...investigation, questionIds: [outageQuestion.id] }),
      [`GET /v1/objects/investigation%3A${INVESTIGATION_ID}`]: () => json(investigationEnvelope),
      [`GET ${outagePath}`]: () => json(outageDetail),
      [`GET ${outagePath}/history`]: () => json(outageHistory),
    };
    const { api, asked } = standInApi(stand);
    renderAt(`/intelligence/investigations/${INVESTIGATION_ID}?tab=forecasts`, api);
    expect(await screen.findAllByTestId('forecast-row')).toHaveLength(1);
    expect(asked.some((line) => line.startsWith('GET /v1/forecasts/questions?'))).toBe(false);
  });

  it('says when no question is due within the horizon', async () => {
    const stand = answers();
    stand['GET /v1/forecasts/questions'] = page([]);
    const { api } = standInApi(stand);
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=forecasts`, api);
    expect(
      await screen.findByText('No open questions resolve within this horizon.'),
    ).toBeInTheDocument();
  });
});
