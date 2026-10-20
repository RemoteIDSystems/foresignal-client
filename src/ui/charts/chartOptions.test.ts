import { darkTokens } from '../../app/theme/tokens';
import { movingAverage, seriesColors, timeSeriesOption, type TimePoint } from './chartOptions';

const DAY = 86_400_000;

describe('the chart option builders', () => {
  it('averages each point over the trailing window, skipping gaps', () => {
    const points: TimePoint[] = [
      [0, 1],
      [DAY, 3],
      [2 * DAY, null],
      [3 * DAY, 5],
    ];
    expect(movingAverage(points, 2)).toEqual([
      [0, 1],
      [DAY, 2],
      [2 * DAY, 3],
      [3 * DAY, 5],
    ]);
    expect(movingAverage([[0, null]], 7)).toEqual([[0, null]]);
  });

  it('draws one smoothed line per series on a time axis, in the theme’s colors', () => {
    const option = timeSeriesOption(
      darkTokens,
      [
        { name: 'Earthquake', points: [[0, 1]] },
        { name: 'Power Outage', points: [[0, 2]] },
      ],
      7,
    );
    const series = option.series as { type: string; name: string; data: unknown[] }[];
    expect(series.map((line) => [line.type, line.name])).toEqual([
      ['line', 'Earthquake'],
      ['line', 'Power Outage'],
    ]);
    expect(series[1]!.data).toEqual([[0, 2]]);
    expect(option.xAxis).toMatchObject({ type: 'time' });
    expect(option.color).toEqual(seriesColors(darkTokens));
    expect(seriesColors(darkTokens)[0]).toBe(darkTokens.color.danger);
  });
});
