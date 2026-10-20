import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ViewSummary, ViewSummaryState } from '../../state/contextSummary';
import { ActivityTimelinePanel, InsightsPanel } from './BottomPanels';
import { RecordLayersContext, type RecordLayersValue } from './recordLayersContext';

const view: ViewSummary = {
  viewport: { bbox: [-130, 20, -60, 55], zoom: 3 },
  counts: new Map(),
  generatedAt: '2026-10-20T14:30:12Z',
  cacheAgeSeconds: 0,
  truncated: false,
  activity: [
    {
      at: '2026-10-20T14:31:00Z',
      ref: 'record:usgs-earthquakes/a1',
      type: 'record',
      title: 'Earthquake M4.8 (Solomon Islands)',
      signalFamily: 'seismic',
    },
    {
      at: '2026-10-20T14:28:00Z',
      ref: 'alert:5',
      type: 'alert',
      title: 'Wildfire growth accelerating (CA)',
      signalFamily: 'fire',
    },
  ],
  insights: [
    {
      ref: 'question:7',
      kind: 'forecast',
      title: 'Port closures within 48 hours',
      probability: 0.68,
      estimativeTerm: 'likely',
      issuer: 'official',
      baseRate: 0.78,
    },
    { ref: 'finding:2', kind: 'finding', title: 'Outage cluster in the Gulf' },
  ],
  related: [{ ref: 'situation:3', type: 'situation', title: 'Gulf Coast storm', status: 'open' }],
};

/** Renders a panel with the page's summary and a selection callback that records its refs. */
function renderWith(panel: React.ReactNode, summary: ViewSummaryState) {
  const selected: string[] = [];
  const value = {
    catalog: { status: 'loading' },
    summary,
    selectRef: async (ref: string) => {
      selected.push(ref);
    },
  } as unknown as RecordLayersValue;
  render(<RecordLayersContext.Provider value={value}>{panel}</RecordLayersContext.Provider>);
  return selected;
}

describe('ActivityTimelinePanel', () => {
  it('lists the view’s activity with its time and family, filters by family, and selects a row’s object', async () => {
    const selected = renderWith(<ActivityTimelinePanel />, { summary: view });
    const list = within(screen.getByRole('list', { name: 'Recent activity' }));
    const rows = list.getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      '14:31Earthquake M4.8 (Solomon Islands)Seismic',
      '14:28Wildfire growth accelerating (CA)Fire',
    ]);
    await userEvent.selectOptions(screen.getByTestId('activity-filter'), 'Fire');
    expect(list.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(list.getByRole('button', { name: /Wildfire/ }));
    expect(selected).toEqual(['alert:5']);
  });

  it('says when the view has no activity', () => {
    renderWith(<ActivityTimelinePanel />, { summary: { ...view, activity: [] } });
    expect(screen.getByText('No activity in this view.')).toBeInTheDocument();
  });

  it('says why the summary did not load', () => {
    renderWith(<ActivityTimelinePanel />, { error: 'Too Many Requests' });
    expect(screen.getByRole('alert')).toHaveTextContent('Too Many Requests');
  });
});

describe('InsightsPanel', () => {
  it('lists each tab’s insights with their basis, percent and ICD term, and the related events', async () => {
    const selected = renderWith(<InsightsPanel onClose={() => {}} />, { summary: view });
    const insights = screen.getByTestId('insights');
    expect(insights).toHaveTextContent('Port closures within 48 hours');
    expect(insights).toHaveTextContent('Issued by Official · base rate 78%');
    expect(insights).toHaveTextContent('68%');
    expect(insights).toHaveTextContent('Likely');
    expect(screen.getByTestId('insights-updated')).toHaveTextContent(
      'Last Updated: 2026-10-20 14:30Z',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Detections' }));
    expect(insights).toHaveTextContent('Outage cluster in the Gulf');
    await userEvent.click(screen.getByRole('tab', { name: 'Hypotheses' }));
    expect(insights).toHaveTextContent('No hypotheses in this view.');
    await userEvent.click(screen.getByRole('tab', { name: 'Related Events' }));
    await userEvent.click(within(insights).getByRole('button', { name: /Gulf Coast storm/ }));
    expect(selected).toEqual(['situation:3']);
  });

  it('says it is summarizing until the first summary is in', () => {
    renderWith(<InsightsPanel onClose={() => {}} />, {});
    expect(screen.getByText('Summarizing this view…')).toBeInTheDocument();
    expect(screen.getByTestId('insights-updated')).toHaveTextContent('Last Updated: —');
  });
});
