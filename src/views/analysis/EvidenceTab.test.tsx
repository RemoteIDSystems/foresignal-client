import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import type { EChartProps } from '../../ui/charts/EChart';
import {
  finding,
  findingEnvelope,
  FINDING_ID,
  impact,
  rate,
  regionSeries,
  seriesData,
  thinRate,
} from '../../intel/testing/analyticsFixtures';
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
const page = (items: unknown[]) => () => json({ items, nextCursor: null });

const answers = (): Record<string, Answer> => ({
  [`GET ${situationPath}`]: () => json(situation),
  [`GET ${situationPath}/members`]: page([member, eventMember]),
  [`GET ${situationPath}/timeline`]: page(timeline),
  [`GET ${situationPath}/changes`]: () => json(changes),
  [`GET /v1/objects/situation%3A${SITUATION_ID}/related`]: () =>
    json({ ref: `situation:${SITUATION_ID}`, items: [] }),
  'GET /v1/analytics/findings': page([finding]),
  'GET /v1/analytics/impacts': page([impact]),
  'GET /v1/analytics/impact-rates': page([thinRate, rate]),
  'GET /v1/analytics/series': page(regionSeries),
  'GET /v1/analytics/series/data': (request) =>
    json(seriesData(new URL(request.url).searchParams.get('ref')!, 2, 1)),
  [`GET /v1/objects/finding%3A${FINDING_ID}`]: () => json(findingEnvelope),
  [`PATCH /v1/analytics/findings/${FINDING_ID}`]: () => json({ ...finding, status: 'dismissed' }),
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

describe('the Evidence tab', () => {
  it('charts the situation’s series by family, with 30-day tiles', async () => {
    const { api, asked } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=evidence`, api);
    expect(await screen.findByRole('tab', { name: 'Evidence (2)' })).toBeInTheDocument();
    const metrics = await screen.findByTestId('metrics-panel');
    const families = within(metrics).getByRole('tablist', { name: 'Metric families' });
    expect(
      within(families)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Seismic', 'Outage']);
    const chart = await within(metrics).findByTestId('metrics-chart');
    expect(chart).toHaveAttribute('data-series', '2');
    expect(chart).toHaveAccessibleName('Seismic over the last 90 days (7-day average)');
    const tiles = screen.getByTestId('metric-tiles');
    expect(tiles).toHaveTextContent('60 events');
    expect(tiles).toHaveTextContent('Earthquake');
    expect(tiles).toHaveTextContent('Quarry Blast');
    expect(tiles).toHaveTextContent('+100% vs. prev. 30d');
    expect(asked.filter((line) => line.startsWith('GET /v1/analytics/series/data'))).toHaveLength(
      2,
    );
    expect(asked.find((line) => line.startsWith('GET /v1/analytics/series?'))).toContain(
      'region=US-CA',
    );

    await userEvent.click(within(families).getByRole('tab', { name: 'Outage' }));
    await waitFor(() =>
      expect(within(metrics).getByTestId('metrics-chart')).toHaveAttribute('data-series', '1'),
    );
    expect(screen.getByTestId('metric-tiles')).toHaveTextContent('Power Outage');
  });

  it('lists the members as evidence by type, with their confidence', async () => {
    const { api } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=evidence`, api);
    const panel = await screen.findByTestId('evidence-panel');
    expect(panel).toHaveTextContent('Evidence (2)');
    const list = within(panel).getByRole('list', { name: 'Evidence' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list).toHaveTextContent('corroborated');
    await userEvent.click(within(panel).getByRole('tab', { name: 'Reports (1)' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('Power outage near Santa Rosa');
    expect(list).toHaveTextContent('uncorroborated');
    await userEvent.click(within(panel).getByRole('tab', { name: 'Imagery (0)' }));
    expect(panel).toHaveTextContent('No evidence of this type.');
  });

  it('shows a finding with its base rate and caveats, and dismisses it with a reason', async () => {
    const { api, asked, bodies } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=evidence`, api);
    const panel = await screen.findByTestId('findings-panel');
    expect(await within(panel).findByText(finding.title)).toBeInTheDocument();
    expect(panel).toHaveTextContent('Analytic Findings (1)');
    expect(within(panel).getByTestId('finding-base-rate')).toHaveTextContent(
      'Base rate: a change this large was flagged once in the previous 700 days',
    );
    expect(asked.find((line) => line.startsWith('GET /v1/analytics/findings?'))).toContain(
      `situationId=${SITUATION_ID}`,
    );

    await userEvent.click(within(panel).getByRole('button', { name: finding.title }));
    const detail = await screen.findByTestId('finding-detail');
    expect(detail).toHaveTextContent('Daily earthquake counts rose from 2 to 9 on 2026-10-12.');
    expect(detail).toHaveTextContent('changepoint-cusum 1.0.0');
    expect(detail).toHaveTextContent('Fewer than 30 events in the window.');
    const reason = await within(detail).findByRole('textbox', { name: 'Reason for dismissing' });
    const dismiss = within(detail).getByRole('button', { name: 'Dismiss finding' });
    expect(dismiss).toBeDisabled();
    await userEvent.type(reason, 'A known geothermal field');
    await userEvent.click(dismiss);
    await waitFor(() => expect(panel).toHaveTextContent('No open findings.'));
    const at = asked.indexOf(`PATCH /v1/analytics/findings/${FINDING_ID}`);
    expect(bodies[at]).toEqual({ status: 'dismissed', reason: 'A known geothermal field' });
    expect(screen.queryByTestId('finding-detail')).toBeNull();
  });

  it('offers no dismissal when the finding’s envelope does not', async () => {
    const stand = answers();
    stand[`GET /v1/objects/finding%3A${FINDING_ID}`] = () =>
      json({ ...findingEnvelope, actions: [] });
    const { api, asked } = standInApi(stand);
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=evidence`, api);
    const panel = await screen.findByTestId('findings-panel');
    await userEvent.click(await within(panel).findByRole('button', { name: finding.title }));
    await waitFor(() => expect(asked).toContain(`GET /v1/objects/finding%3A${FINDING_ID}`));
    expect(screen.queryByRole('button', { name: 'Dismiss finding' })).toBeNull();
  });

  it('shows the projected impacts with their interval and historical rate', async () => {
    const { api, asked } = standInApi(answers());
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=evidence`, api);
    const panel = await screen.findByTestId('impacts-panel');
    expect(await within(panel).findByTestId('impact-probability')).toHaveTextContent('15%');
    expect(panel).toHaveTextContent('Outage · California');
    expect(panel).toHaveTextContent('interval 10%–20% · n = 42');
    expect(panel).toHaveTextContent('Base rate: 50% (40%–60%), n = 42');
    expect(panel).toHaveTextContent('not an official warning');
    const read = asked.find((line) => line.startsWith('GET /v1/analytics/impacts?'))!;
    expect(read).toContain('region=US-CA');
    expect(read).toContain('since=');
  });

  it('keeps the other panels when one part fails', async () => {
    const stand = answers();
    stand['GET /v1/analytics/findings'] = () =>
      json({ title: 'Service Unavailable', status: 503, detail: 'Findings are rebuilding.' }, 503);
    stand['GET /v1/analytics/series'] = page([]);
    const { api } = standInApi(stand);
    renderAt(`/intelligence/situations/${SITUATION_ID}?tab=evidence`, api);
    const findings = await screen.findByTestId('findings-panel');
    expect(
      await within(findings).findByText('Service Unavailable: Findings are rebuilding.'),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('metrics-panel')).toHaveTextContent(
      'No analysis series cover this area.',
    );
    expect(await within(screen.getByTestId('impacts-panel')).findByText('15%')).toBeVisible();
  });

  it('lists an investigation’s items and reads no regional series', async () => {
    const { api, asked } = standInApi({
      [`GET /v1/investigations/${INVESTIGATION_ID}`]: () => json(investigation),
      [`GET /v1/objects/investigation%3A${INVESTIGATION_ID}`]: () => json(investigationEnvelope),
      [`GET /v1/objects/investigation%3A${INVESTIGATION_ID}/related`]: () =>
        json({ ref: `investigation:${INVESTIGATION_ID}`, items: [] }),
      'GET /v1/analytics/impact-rates': page([rate]),
    });
    renderAt(`/intelligence/investigations/${INVESTIGATION_ID}?tab=evidence`, api);
    expect(await screen.findByRole('tab', { name: 'Evidence (1)' })).toBeInTheDocument();
    expect(await screen.findByTestId('metrics-panel')).toHaveTextContent(
      'No analysis series cover this area.',
    );
    expect(await screen.findByText('No open findings.')).toBeInTheDocument();
    expect(await screen.findByText('No projected impacts in this area.')).toBeInTheDocument();
    expect(asked.some((line) => line.startsWith('GET /v1/analytics/series'))).toBe(false);
    expect(asked.some((line) => line.startsWith('GET /v1/analytics/findings'))).toBe(false);
  });
});
