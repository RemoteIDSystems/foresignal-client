import { isStormLike, threeDViewOf } from './threeD';

describe('threeDViewOf', () => {
  it('gives aircraft their altitude, satellites their orbit and storms their structure', () => {
    expect(threeDViewOf('aircraft')).toBe('altitude');
    expect(threeDViewOf('satellite')).toBe('orbit');
    expect(threeDViewOf('cyclone')).toBe('storm');
    expect(isStormLike('cyclone-track')).toBe(true);
  });

  it('keeps everything else on the 2D map', () => {
    expect(threeDViewOf('earthquake')).toBeUndefined();
    expect(threeDViewOf(undefined)).toBeUndefined();
    expect(isStormLike('earthquake')).toBe(false);
  });
});
