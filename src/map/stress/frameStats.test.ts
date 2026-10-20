// @vitest-environment node
import { frameStats } from './frameStats';
import { stressModeOn } from './stressMode';

describe('frameStats', () => {
  it('gives the rate, percentiles and slow frames of the intervals', () => {
    // Nine 16 ms frames and one 50 ms frame.
    const times = [0];
    for (let i = 0; i < 9; i++) times.push(times[times.length - 1]! + 16);
    times.push(times[times.length - 1]! + 50);
    const stats = frameStats(times);
    expect(stats.frames).toBe(10);
    expect(stats.seconds).toBeCloseTo(0.194);
    expect(stats.fps).toBeCloseTo(10 / 0.194);
    expect(stats.p50).toBe(16);
    expect(stats.p95).toBe(50);
    expect(stats.max).toBe(50);
    expect(stats.slow).toBe(1);
  });

  it('gives zeros without two frames', () => {
    expect(frameStats([5]).frames).toBe(0);
    expect(frameStats([]).fps).toBe(0);
  });
});

describe('stressModeOn', () => {
  it('is on with ?stress in a development build', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(stressModeOn('?stress')).toBe(true);
    expect(stressModeOn('?x=1&stress=all')).toBe(true);
    expect(stressModeOn('')).toBe(false);
  });
});
