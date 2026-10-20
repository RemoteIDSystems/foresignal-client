import { init, use as registerParts, type ComposeOption, type EChartsType } from 'echarts/core';
import {
  BarChart,
  LineChart,
  ScatterChart,
  type BarSeriesOption,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type MarkLineComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Only what the dashboard draws is registered, so the chart chunk stays small: line, bar and
// scatter series on a grid, with a legend, tooltips and reference lines, on canvas.
registerParts([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

/** The chart options this client builds: the registered series and components only. */
export type ChartOption = ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | MarkLineComponentOption
  | TooltipComponentOption
>;

/** Creates a canvas chart in an element. */
export function createChart(element: HTMLElement): EChartsType {
  return init(element, undefined, { renderer: 'canvas' });
}
