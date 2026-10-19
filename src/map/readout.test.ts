import { formatDegrees, formatElevation, insetBoxes, niceScale } from './readout';

describe('formatDegrees', () => {
  it('shows four decimals and a degree sign', () => {
    expect(formatDegrees(28)).toBe('28.0000°');
    expect(formatDegrees(-80.123456)).toBe('-80.1235°');
  });
});

describe('formatElevation', () => {
  it('shows whole meters with separators, including below sea level', () => {
    expect(formatElevation(0)).toBe('0 m');
    expect(formatElevation(-0.4)).toBe('0 m');
    expect(formatElevation(-27.6)).toBe('-28 m');
    expect(formatElevation(8848.86)).toBe('8,849 m');
  });
});

describe('niceScale', () => {
  it('picks the largest 5, 2 or 1 × 10ⁿ that fits and sizes the bar to it', () => {
    expect(niceScale(4_073_000, 100)).toEqual({ pixels: 49, meters: 2_000_000, label: '2,000 km' });
    expect(niceScale(1_200_000, 100)).toEqual({ pixels: 83, meters: 1_000_000, label: '1,000 km' });
    expect(niceScale(730, 100)).toEqual({ pixels: 68, meters: 500, label: '500 m' });
    expect(niceScale(5_000, 100)).toEqual({ pixels: 100, meters: 5_000, label: '5 km' });
  });

  it('returns undefined for a span or width that is not positive', () => {
    expect(niceScale(0, 100)).toBeUndefined();
    expect(niceScale(Number.NaN, 100)).toBeUndefined();
    expect(niceScale(1000, 0)).toBeUndefined();
  });
});

describe('insetBoxes', () => {
  it('places a rectangle on an equirectangular inset', () => {
    expect(insetBoxes({ west: -90, south: 0, east: 0, north: 45 }, 180, 90)).toEqual([
      { left: 45, top: 22.5, width: 45, height: 22.5 },
    ]);
  });

  it('splits a rectangle that crosses the antimeridian into two boxes', () => {
    expect(insetBoxes({ west: 170, south: -10, east: -170, north: 10 }, 360, 180)).toEqual([
      { left: 350, top: 80, width: 10, height: 20 },
      { left: 0, top: 80, width: 10, height: 20 },
    ]);
  });
});
