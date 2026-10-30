import { afterEach, describe, expect, it } from 'vitest';
import { formatDay, formatInstant, getClock, resetClock, setClock } from './clock';

afterEach(() => resetClock());

describe('formatInstant', () => {
  it('renders UTC with a Z suffix by default (unchanged from before R2-007)', () => {
    expect(formatInstant('2025-09-18T14:32:10Z')).toBe('2025-09-18 14:32Z');
  });

  it('returns an em dash for a missing or unparseable instant', () => {
    expect(formatInstant(null)).toBe('—');
    expect(formatInstant(undefined)).toBe('—');
    expect(formatInstant('not-a-date')).toBe('—');
  });

  it('renders in the chosen timezone with its zone name', () => {
    setClock({ timezone: 'Europe/Paris', locale: null });
    // Winter: Paris is UTC+1, so 14:32Z is 15:32 local.
    const text = formatInstant('2025-01-15T14:32:00Z');
    expect(text).toContain('2025-01-15');
    expect(text).toContain('15:32');
    expect(text).toContain('GMT+1');
  });
});

describe('formatDay', () => {
  it('renders the UTC day uppercased by default', () => {
    expect(formatDay('2025-09-18T14:32:10Z')).toBe('SEP 18');
    expect(formatDay('not-a-date')).toBe('');
  });

  it('uses the chosen timezone for the day boundary', () => {
    setClock({ timezone: 'Europe/Paris', locale: null });
    // 23:30Z is already the next day in Paris.
    expect(formatDay('2025-01-15T23:30:00Z')).toBe('JAN 16');
  });
});

describe('setClock / resetClock', () => {
  it('holds the applied clock and resets to the UTC default', () => {
    setClock({ timezone: 'Asia/Tokyo', locale: 'en-GB' });
    expect(getClock()).toEqual({ timezone: 'Asia/Tokyo', locale: 'en-GB' });
    resetClock();
    expect(getClock()).toEqual({ timezone: null, locale: null });
  });
});
