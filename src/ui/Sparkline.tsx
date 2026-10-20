import styles from './Sparkline.module.css';
import { sparklinePoints } from './sparklinePoints';

/** Props for {@link Sparkline}. */
export interface SparklineProps {
  /** The values, oldest first. */
  values: readonly number[];
  /** Width and height in pixels. */
  width?: number;
  height?: number;
  /** Accessible description, such as what the values are and over what time. */
  label: string;
  /** The line's color: the accent (default), or a level's red, amber or blue. */
  tone?: 'accent' | 'danger' | 'warning' | 'info';
}

/**
 * A small line chart of a series, drawn as SVG in the accent color (or a level's tone) with a faint
 * fill: a trend at a glance, with no axes. The last value is marked.
 */
export function Sparkline({
  values,
  width = 72,
  height = 18,
  label,
  tone = 'accent',
}: SparklineProps) {
  const points = sparklinePoints(values, width, height);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = points.at(-1);
  return (
    <svg
      className={styles.sparkline}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      data-points={points.length}
      data-tone={tone}
    >
      {points.length > 1 && (
        <>
          <polygon className={styles.area} points={`0,${height} ${line} ${width},${height}`} />
          <polyline className={styles.line} points={line} />
        </>
      )}
      {last && <circle className={styles.dot} cx={last[0]} cy={last[1]} r={1.8} />}
    </svg>
  );
}
