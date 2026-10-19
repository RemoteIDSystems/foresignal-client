// @vitest-environment node
import { describe, expect, it } from 'vitest';
import spriteIndex from './fixtures/sprite-index.json';
import { hexToRgb, renderSdf, spriteFileName, SpriteSheet, type SpriteIndex } from './sprite';

describe('spriteFileName', () => {
  const url = 'http://localhost:8080/v1/map/sprites/foresignal-1b0f0988';

  it('names the 1× and 2× index and sheet files', () => {
    expect(spriteFileName(url, 1, 'json')).toBe('foresignal-1b0f0988.json');
    expect(spriteFileName(url, 2, 'png')).toBe('foresignal-1b0f0988@2x.png');
  });

  it('works through a tile-key prefix and ignores a query string', () => {
    expect(
      spriteFileName('https://x.test/v1/k/abc/v1/map/sprites/foresignal-0a0b0c0d?v=1', 1, 'png'),
    ).toBe('foresignal-0a0b0c0d.png');
  });

  it('rejects a URL that is not a sprite', () => {
    expect(spriteFileName('http://localhost:8080/v1/map/sprites/other', 1, 'json')).toBeUndefined();
  });
});

describe('renderSdf', () => {
  /**
   * One pixel each: far outside, in the halo band, on the edge, and deep inside. At pixel ratio 2
   * the smoothing is 0.0525 wide, so the fill (0.75) and 1 px halo (0.625) bands do not overlap.
   */
  const distance = [0, 176, 191, 255];
  const pixelRatio = 2;

  it('fills inside the 0.75 edge with the color and leaves the outside clear', () => {
    const out = renderSdf(distance, { color: '#C92A2A', pixelRatio });
    expect([...out.slice(12, 16)]).toEqual([0xc9, 0x2a, 0x2a, 255]);
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(0);
    // On the edge the fill is partly transparent.
    expect(out[11]).toBeGreaterThan(0);
    expect(out[11]).toBeLessThan(255);
  });

  it('draws the halo just outside the edge', () => {
    // A 1 px halo's edge is (6 - 1) / 8 = 0.625; 176 / 255 ≈ 0.69 is between it and the fill edge.
    const out = renderSdf(distance, {
      color: '#C92A2A',
      haloColor: '#1D1F23',
      haloWidth: 1,
      pixelRatio,
    });
    expect([...out.slice(4, 8)]).toEqual([0x1d, 0x1f, 0x23, 255]);
    expect(out[3]).toBe(0);
    expect([...out.slice(12, 16)]).toEqual([0xc9, 0x2a, 0x2a, 255]);
  });

  it('reads short and long hex colors', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#1D1F23')).toEqual([0x1d, 0x1f, 0x23]);
    expect(hexToRgb('red')).toEqual([0, 0, 0]);
  });
});

describe('SpriteSheet', () => {
  it('cuts an icon’s distance field out of the sheet by its index entry', () => {
    // A 4 × 3 sheet whose alpha is the pixel number; one 2 × 2 icon at (1, 1).
    const alpha = Uint8Array.from({ length: 12 }, (_, i) => i);
    const index: SpriteIndex = {
      dot: { x: 1, y: 1, width: 2, height: 2, pixelRatio: 1, sdf: true },
    };
    const sheet = new SpriteSheet(index, alpha, 4, 1);
    expect(sheet.has('dot')).toBe(true);
    expect(sheet.has('star')).toBe(false);
    expect(sheet.distanceField('dot')).toEqual({
      data: Uint8Array.from([5, 6, 9, 10]),
      width: 2,
      height: 2,
    });
    expect(sheet.distanceField('star')).toBeUndefined();
  });

  it('accepts the live sprite index shape', () => {
    const index = spriteIndex as SpriteIndex;
    expect(index['fighter-jet']).toEqual({
      x: 56,
      y: 0,
      width: 54,
      height: 54,
      pixelRatio: 1,
      sdf: true,
    });
  });
});
