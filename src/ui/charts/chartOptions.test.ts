import { darkTokens } from '../../app/theme/tokens';
import {
  movingAverage,
  reliabilityOption,
  seriesColors,
  timeSeriesOption,
  type TimePoint,
} from './chartOptions';

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

  it('runs a percent axis from 0 to 100', () => {
    const option = timeSeriesOption(
      darkTokens,
      [{ name: 'Ensemble', points: [[0, 60]] }],
      undefined,
      true,
    );
    expect(option.yAxis).toMatchObject({ min: 0, max: 100 });
    expect((option.series as { data: unknown[] }[])[0]!.data).toEqual([[0, 60]]);
  });

  it('draws a reliability diagram: the diagonal, the bins, and the curve when there is one', () => {
    const bins = [
      { forecast: 0.06, observed: 0.1, n: 10 },
      { forecast: 0.74, observed: 0.67, n: 12 },
    ];
    const plain = reliabilityOption(darkTokens, bins, []);
    const series = plain.series as { type: string; name: string; data: number[][] }[];
    expect(series.map((s) => [s.type, s.name])).toEqual([
      ['line', 'Perfect calibration'],
      ['scatter', 'Bins'],
    ]);
    expect(series[0]!.data).toEqual([
      [0, 0],
      [100, 100],
    ]);
    expect(series[1]!.data[0]).toEqual([6, 10, 10]);
    const curved = reliabilityOption(darkTokens, bins, [
      [0, 0.05],
      [1, 0.9],
    ]);
    expect((curved.series as { name: string; data: number[][] }[])[2]).toMatchObject({
      name: 'Recalibrated',
      data: [
        [0, 5],
        [100, 90],
      ],
    });
  });
});
