import { useEffect, useRef } from 'react';
import type { EChartsType } from 'echarts/core';
import { createChart, type ChartOption } from './echarts';

/**
 * The ECharts canvas behind {@link EChart}, loaded on demand: created once, given each new option
 * whole (so a series that goes away is removed), resized with its box, and disposed on unmount.
 */
export default function EChartCanvas({ option }: { option: ChartOption }) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType>(undefined);
  useEffect(() => {
    const box = element.current;
    if (!box) return;
    const instance = createChart(box);
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(box);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = undefined;
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);
  return <div ref={element} style={{ width: '100%', height: '100%' }} />;
}
