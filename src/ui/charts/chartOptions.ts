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
 * many days' trailing average, as the mock's "(7-day average)". With `percent`, the values are
 * percents and the axis runs from 0 to 100.
 */
export function timeSeriesOption(
  tokens: ThemeTokens,
  series: readonly ChartSeries[],
  averageDays?: number,
  percent = false,
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
    yAxis: percent
      ? {
          type: 'value',
          min: 0,
          max: 100,
          axisLine,
          splitLine,
          axisLabel: { formatter: '{value}%' },
        }
      : { type: 'value', axisLine, splitLine },
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

/** A reliability bin: the mean forecast, the observed frequency and how many forecasts. */
export interface ReliabilityBin {
  forecast: number;
  observed: number;
  n: number;
}

/**
 * A reliability diagram (022's calibration curve): forecast probability against observed
 * frequency, both 0–100%. The diagonal is perfect calibration; the bins are dots sized by how many
 * forecasts they hold; the recalibrated curve, when there is one, is a line.
 */
export function reliabilityOption(
  tokens: ThemeTokens,
  bins: readonly ReliabilityBin[],
  curve: readonly [number, number][],
): ChartOption {
  const axisLine = { lineStyle: { color: tokens.color.borderStrong } };
  const splitLine = { lineStyle: { color: tokens.color.border } };
  const axis = (name: string) => ({
    type: 'value' as const,
    min: 0,
    max: 100,
    name,
    nameLocation: 'middle' as const,
    nameGap: 26,
    axisLine,
    splitLine,
    axisLabel: { formatter: '{value}%' },
  });
  const largest = Math.max(1, ...bins.map((bin) => bin.n));
  // A probability as a percent to a tenth, so 0.06 draws at 6 and not 6.000000000000001.
  const pct = (p: number) => Math.round(p * 1000) / 10;
  return {
    ...baseOption(tokens),
    tooltip: { ...baseOption(tokens).tooltip, trigger: 'item' },
    grid: { left: 48, right: 12, top: 12, bottom: 64 },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { color: tokens.color.textSecondary, fontSize: 11 },
    },
    xAxis: axis('Forecast'),
    yAxis: axis('Observed'),
    series: [
      {
        type: 'line',
        name: 'Perfect calibration',
        data: [
          [0, 0],
          [100, 100],
        ],
        showSymbol: false,
        lineStyle: { type: 'dashed', width: 1, color: tokens.color.textSecondary },
        itemStyle: { color: tokens.color.textSecondary },
      },
      {
        type: 'scatter',
        name: 'Bins',
        data: bins.map((bin) => [pct(bin.forecast), pct(bin.observed), bin.n]),
        symbolSize: (value: number[]) => 6 + 14 * Math.sqrt((value[2] ?? 0) / largest),
        itemStyle: { color: tokens.color.accent },
      },
      ...(curve.length > 0
        ? [
            {
              type: 'line' as const,
              name: 'Recalibrated',
              data: curve.map(([x, y]) => [pct(x), pct(y)]),
              showSymbol: false,
              lineStyle: { width: 1.5, color: tokens.color.warning },
              itemStyle: { color: tokens.color.warning },
            },
          ]
        : []),
    ],
  };
}

/** One group's learned mean per slot, for {@link slotMeansOption}. */
export interface SlotSeries {
  name: string;
  /** Slot number and mean, as the backend gives them. */
  points: readonly [number, number][];
}

/**
 * An anomaly rule's learned baseline (030): the mean per slot (hour of week or of day) of each
 * group, one line per group, on a numeric slot axis.
 */
export function slotMeansOption(
  tokens: ThemeTokens,
  series: readonly SlotSeries[],
  slotName: string,
): ChartOption {
  const axisLine = { lineStyle: { color: tokens.color.borderStrong } };
  const splitLine = { lineStyle: { color: tokens.color.border } };
  return {
    ...baseOption(tokens),
    grid: { left: 36, right: 12, top: 12, bottom: series.length > 1 ? 56 : 36 },
    legend:
      series.length > 1
        ? { bottom: 0, textStyle: { color: tokens.color.textSecondary } }
        : undefined,
    xAxis: {
      type: 'value',
      name: slotName,
      nameLocation: 'middle',
      nameGap: 22,
      min: 0,
      axisLine,
      splitLine: { show: false },
    },
    yAxis: { type: 'value', axisLine, splitLine },
    series: series.map((line) => ({
      type: 'line' as const,
      name: line.name,
      data: line.points.map((point) => [...point]),
      showSymbol: false,
      lineStyle: { width: 1.5 },
    })),
  };
}
