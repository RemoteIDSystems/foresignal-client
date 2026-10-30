import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme, resolveTheme } from './context';

describe('resolveTheme', () => {
  it('picks the named theme for an explicit light or dark choice', () => {
    expect(resolveTheme('light')).toBe(lightTheme);
    expect(resolveTheme('dark')).toBe(darkTheme);
  });

  it('follows the OS for system (and for an unset or unknown choice)', () => {
    expect(resolveTheme('system', true)).toBe(darkTheme);
    expect(resolveTheme('system', false)).toBe(lightTheme);
    expect(resolveTheme(null, false)).toBe(lightTheme);
    expect(resolveTheme(undefined, true)).toBe(darkTheme);
  });

  it('defaults to dark when the OS preference is unknown', () => {
    expect(resolveTheme('system')).toBe(darkTheme);
  });
});
