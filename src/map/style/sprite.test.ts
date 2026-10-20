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

/** A one-row sheet of square icons, each a filled square of `glyph` pixels centered in its cell. */
function sheetOf(icons: { name: string; cell: number; glyph: number }[], pixelRatio = 1) {
  const width = icons.reduce((sum, icon) => sum + icon.cell, 0);
  const height = Math.max(...icons.map((icon) => icon.cell));
  const alpha = new Uint8Array(width * height);
  const index: SpriteIndex = {};
  let x = 0;
  for (const { name, cell, glyph } of icons) {
    index[name] = { x, y: 0, width: cell, height: cell, pixelRatio, sdf: true };
    const pad = Math.floor((cell - glyph) / 2);
    for (let row = pad; row < pad + glyph; row++) {
      // Inside the fill edge, with a halo-range ring around it that must not count.
      alpha.fill(200, row * width + x + pad, row * width + x + pad + glyph);
    }
    for (let col = x; col < x + cell; col++) if (alpha[col] === 0) alpha[col] = 150;
    x += cell;
  }
  return new SpriteSheet(index, alpha, width, pixelRatio);
}

describe('SpriteSheet display size', () => {
  const sprite = sheetOf([
    { name: 'a', cell: 21, glyph: 13 },
    { name: 'b', cell: 21, glyph: 15 },
    { name: 'c', cell: 21, glyph: 11 },
    { name: 'fighter-jet', cell: 54, glyph: 48 },
  ]);

  it('measures the shape inside the fill edge, not the cell', () => {
    expect(sprite.glyphSize('a')).toBe(13);
    expect(sprite.glyphSize('fighter-jet')).toBe(48);
    expect(sprite.glyphSize('missing')).toBeUndefined();
  });

  it('leaves ordinary icons alone and scales an oversized one to the median shape', () => {
    expect(sprite.referenceGlyphSize()).toBe(15);
    expect(sprite.displayScale('a')).toBe(1);
    expect(sprite.displayScale('c')).toBe(1);
    expect(sprite.displayScale('fighter-jet')).toBeCloseTo(15 / 48);
    expect(sprite.displaySize('a')).toEqual({ width: 21, height: 21 });
    const jet = sprite.displaySize('fighter-jet');
    expect(jet?.width).toBeCloseTo((54 * 15) / 48);
    expect(jet!.width * (48 / 54)).toBeCloseTo(15);
  });

  it('reads sizes in CSS pixels on a 2x sheet', () => {
    const retina = sheetOf(
      [
        { name: 'a', cell: 42, glyph: 26 },
        { name: 'b', cell: 42, glyph: 26 },
        { name: 'big', cell: 108, glyph: 96 },
      ],
      2,
    );
    expect(retina.glyphSize('a')).toBe(13);
    expect(retina.displaySize('a')).toEqual({ width: 21, height: 21 });
    expect(retina.displayScale('big')).toBeCloseTo(13 / 48);
  });
});
