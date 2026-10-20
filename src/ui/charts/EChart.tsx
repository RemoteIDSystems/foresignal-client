import { lazy, Suspense } from 'react';
import type { ChartOption } from './echarts';
import styles from './EChart.module.css';

const EChartCanvas = lazy(() => import('./EChartCanvas'));

/** Props for {@link EChart}. */
export interface EChartProps {
  /** The chart, as built by the option builders in `chartOptions.ts`. */
  option: ChartOption;
  /** The chart's height in pixels; it takes its container's width. */
  height: number;
  /** What the chart shows, for screen readers. */
  label: string;
  /** A test id for the chart's box. */
  testId?: string;
}

/**
 * A chart drawn with ECharts on canvas (020; reused by 022 and 023), in the dark theme. ECharts
 * loads with the first chart on screen, in its own chunk, so the map views do not carry it. The box
 * is labeled for screen readers and says how many series it draws (`data-series`).
 */
export function EChart({ option, height, label, testId }: EChartProps) {
  const series = Array.isArray(option.series) ? option.series.length : option.series ? 1 : 0;
  return (
    <div
      className={styles.chart}
      style={{ height }}
      role="img"
      aria-label={label}
      data-testid={testId}
      data-series={series}
    >
      <Suspense fallback={<span className={styles.loading}>Loading chart…</span>}>
        <EChartCanvas option={option} />
      </Suspense>
    </div>
  );
}
