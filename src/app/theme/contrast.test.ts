import { AA_LARGE, AA_TEXT, contrast, luminance, themePairs } from './contrast';
import { darkTokens } from './tokens';

describe('contrast', () => {
  it('follows the WCAG formula at its fixed points', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 6);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 6);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrast('#777777', '#777777')).toBe(1);
  });

  it('holds the theme to its minimums: all text 4.5:1, the accent 3:1', () => {
    const pairs = themePairs(darkTokens);
    expect(pairs.filter((pair) => pair.minimum === AA_TEXT).length).toBeGreaterThan(0);
    expect(pairs.filter((pair) => pair.minimum === AA_LARGE).length).toBeGreaterThan(0);
    const failing = pairs.filter((pair) => pair.ratio < pair.minimum);
    expect(failing).toEqual([]);
  });

  it('checks every chip tone', () => {
    const chips = themePairs(darkTokens).filter((pair) => pair.name.endsWith(' chip'));
    expect(chips.map((pair) => pair.name)).toEqual([
      'neutral chip',
      'info chip',
      'success chip',
      'warning chip',
      'danger chip',
      'teal chip',
      'violet chip',
      'orange chip',
    ]);
  });
});
