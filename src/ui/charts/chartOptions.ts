import type { ThemeTokens } from '../../app/theme';
import type { ChartOption } from './echarts';

/** A point of a time series: epoch ms and value (null in a gap). */
export type TimePoint = [number, number | null];

/** A named line of a time-series chart. */
export interface ChartSeries {
  name: string;
  points: readonly TimePoint[];
}

/** The series colors in order, as the Conflict mock's metrics draw them: red, orange, blue, gray. */
export function seriesColors(tokens: ThemeTokens): string[] {
  return [
    tokens.color.danger,
    tokens.color.warning,
    tokens.color.accent,
    tokens.color.textSecondary,
    tokens.color.success,
    tokens.tone.violetFg,
  ];
}

/** What every chart shares: no background, the theme's type and colors, a dark tooltip. */
export function baseOption(tokens: ThemeTokens): ChartOption {
  return {
    backgroundColor: 'transparent',
    color: seriesColors(tokens),
    textStyle: { fontFamily: tokens.font.family, color: tokens.color.textSecondary, fontSize: 11 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.color.panel,
      borderColor: tokens.color.borderStrong,
      textStyle: { color: tokens.color.text, fontSize: 11 },
    },
    animation: false,
  };
}

/**
 * A trailing moving average over `days` days of a daily series: each point the mean of the points
 * in the window ending at it (gaps skipped); null where the window holds no value.
 */
export function movingAverage(points: readonly TimePoint[], days: number): TimePoint[] {
  const span = days * 86_400_000;
  return points.map(([t]) => {
    const inWindow = points.filter(([u, v]) => v !== null && u <= t && u > t - span) as [
      number,
      number,
    ][];
    if (inWindow.length === 0) return [t, null];
    return [t, inWindow.reduce((sum, [, v]) => sum + v, 0) / inWindow.length];
  });
}

/**
 * A time-series line chart (the Conflict mock's CONFLICT METRICS): one smoothed line per series on
 * a time axis, the legend under it, the grid lines faint. With `averageDays`, each line is that
 * many days' trailing average, as the mock's "(7-day average)".
 */
export function timeSeriesOption(
  tokens: ThemeTokens,
  series: readonly ChartSeries[],
  averageDays?: number,
): ChartOption {
  const axisLine = { lineStyle: { color: tokens.color.borderStrong } };
  const splitLine = { lineStyle: { color: tokens.color.border } };
  return {
    ...baseOption(tokens),
    grid: { left: 40, right: 12, top: 12, bottom: 44 },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: tokens.color.textSecondary, fontSize: 11 },
    },
    xAxis: { type: 'time', axisLine, splitLine: { show: false } },
    yAxis: { type: 'value', axisLine, splitLine },
    series: series.map((line) => ({
      type: 'line' as const,
      name: line.name,
      data: (averageDays ? movingAverage(line.points, averageDays) : line.points).map((p) => [
        ...p,
      ]),
      showSymbol: false,
      smooth: true,
      connectNulls: false,
      lineStyle: { width: 1.5 },
    })),
  };
}
