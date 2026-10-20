import { render, screen } from '@testing-library/react';
import type { GlanceState } from '../../glance/useGlance';
import { GlanceStrip, InsetHeat } from './GlanceStrip';

const state = {
  glance: { glance: { status: 'ok', alerts: { latest: [] }, lastSeq: 1107 } },
  series: {
    series: [
      {
        key: null,
        points: [
          { t: 'a', value: 21 },
          { t: 'b', value: 24 },
        ],
      },
    ],
  },
  topSources: { items: [{ key: 'usgs-earthquakes', sourceId: 'usgs-earthquakes', count: 45 }] },
  topKinds: { items: [{ key: 'earthquake', kind: 'earthquake', count: 45 }] },
  grid: {
    features: [
      {
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
            ],
          ],
        },
        properties: { value: 6 },
      },
    ],
  },
} as unknown as GlanceState;

describe('GlanceStrip', () => {
  it('shows the health, the day’s changes with their sparkline, the leaders and the alerts', () => {
    render(<GlanceStrip state={state} />);
    const strip = screen.getByTestId('glance-strip');
    expect(strip).toHaveAttribute('data-status', 'ok');
    expect(strip).toHaveTextContent('Operational');
    expect(screen.getByTestId('glance-activity')).toHaveTextContent('45 changes · 24 h');
    expect(
      screen.getByRole('img', {
        name: 'Record changes per hour over the last 24 hours; 24 in the last hour',
      }),
    ).toHaveAttribute('data-points', '2');
    expect(screen.getByTestId('glance-top')).toHaveTextContent(
      'USGS Earthquakes 45 · Earthquake 45',
    );
    expect(screen.getByTestId('glance-alerts')).toHaveTextContent('No recent alerts');
  });

  it('waits quietly before the first status', () => {
    render(<GlanceStrip state={{}} />);
    expect(screen.getByTestId('glance-strip')).toHaveTextContent('Connecting');
  });
});

describe('InsetHeat', () => {
  it('draws one dot per cell, and nothing without a grid', () => {
    const { container, rerender } = render(<InsetHeat state={state} />);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    rerender(<InsetHeat state={{}} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
