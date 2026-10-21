/** A frame slower than this misses 30 frames per second, in ms. */
export const SLOW_FRAME_MS = 1000 / 30;

/** One frame at 60 frames per second, in ms. */
export const SIXTY_FPS_FRAME_MS = 1000 / 60;

/**
 * The 95th-percentile frame interval within which a view holds 60 frames per second: one and a
 * half frames, 25 ms. A frame that misses the display's refresh is shown a whole refresh later
 * (33.3 ms or more), so a 95th percentile under this means 95 frames in 100 met the refresh.
 */
export const SIXTY_FPS_P95_MS = 1.5 * SIXTY_FPS_FRAME_MS;

/** Frame timing over a stretch of rendered frames. */
export interface FrameStats {
  /** Frame intervals measured. */
  frames: number;
  /** Seconds the stretch lasted. */
  seconds: number;
  /** Frames per second over the stretch. */
  fps: number;
  /** Median, 95th and 99th percentile and longest frame interval, in ms. */
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Intervals longer than {@link SLOW_FRAME_MS}. */
  slow: number;
}

/**
 * Frame timing from the times frames were rendered (ms, ascending): the intervals between them,
 * their percentiles (nearest rank) and how many were slow. Fewer than two times give zeros.
 */
export function frameStats(times: readonly number[]): FrameStats {
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) intervals.push(times[i]! - times[i - 1]!);
  if (intervals.length === 0) {
    return { frames: 0, seconds: 0, fps: 0, p50: 0, p95: 0, p99: 0, max: 0, slow: 0 };
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const rank = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
  const total = times[times.length - 1]! - times[0]!;
  return {
    frames: intervals.length,
    seconds: total / 1000,
    fps: (intervals.length * 1000) / total,
    p50: rank(0.5),
    p95: rank(0.95),
    p99: rank(0.99),
    max: sorted[sorted.length - 1]!,
    slow: intervals.filter((interval) => interval > SLOW_FRAME_MS).length,
  };
}
