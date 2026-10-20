import {
  clampInstant,
  formatHudTime,
  frameStep,
  offsetToPosition,
  positionToOffset,
  SCRUB_MARKS,
  wholeSecondIso,
} from './scrub';

const HOUR = 3_600_000;

describe('the scrubber’s track', () => {
  it('puts each mark where the mock draws it, evenly spaced', () => {
    expect(SCRUB_MARKS.map((mark) => mark.label)).toEqual(['-24h', '-6h', 'Now', '+6h', '+24h']);
    for (const mark of SCRUB_MARKS) {
      expect(positionToOffset(mark.at)).toBe(mark.offset);
      expect(offsetToPosition(mark.offset)).toBe(mark.at);
    }
  });

  it('is linear between marks, and the two mappings undo each other', () => {
    expect(positionToOffset(0.375)).toBe(-3 * HOUR);
    expect(positionToOffset(0.125)).toBe(-15 * HOUR);
    for (const offset of [-20 * HOUR, -5 * HOUR, -60_000, 3 * HOUR, 23 * HOUR]) {
      expect(positionToOffset(offsetToPosition(offset))).toBeCloseTo(offset, 3);
    }
  });

  it('clamps positions and offsets beyond the ends', () => {
    expect(positionToOffset(-1)).toBe(-24 * HOUR);
    expect(positionToOffset(2)).toBe(24 * HOUR);
    expect(offsetToPosition(-48 * HOUR)).toBe(0);
    expect(offsetToPosition(48 * HOUR)).toBe(1);
  });
});

describe('time formats', () => {
  const at = Date.UTC(2025, 8, 18, 14, 32, 17, 845);

  it('shows the HUD’s date-time as the mock does', () => {
    expect(formatHudTime(at)).toBe('2025-09-18 14:32:17Z');
  });

  it('gives the backend’s asOf to the whole second', () => {
    expect(wholeSecondIso(at)).toBe('2025-09-18T14:32:17Z');
  });
});

describe('frameStep', () => {
  it('spreads a span over about 120 frames, never under 10 seconds', () => {
    expect(frameStep(6 * HOUR)).toBe('180s');
    expect(frameStep(24 * HOUR)).toBe('720s');
    expect(frameStep(60_000)).toBe('10s');
  });
});

describe('clampInstant', () => {
  const now = Date.UTC(2026, 9, 20, 12);

  it('keeps an instant within the last day and the backend’s retention, never in the future', () => {
    expect(clampInstant(now + HOUR, now)).toBe(now);
    expect(clampInstant(now - 30 * HOUR, now)).toBe(now - 24 * HOUR);
    expect(clampInstant(now - 10 * HOUR, now, now - 8 * HOUR)).toBe(now - 8 * HOUR);
    expect(clampInstant(now - 2 * HOUR, now, now - 8 * HOUR)).toBe(now - 2 * HOUR);
  });
});
