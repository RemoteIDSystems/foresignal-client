import type { ThemeTokens } from './tokens';

/** WCAG 2.x's minimum contrast for body text (AA). */
export const AA_TEXT = 4.5;

/** WCAG 2.x's minimum contrast for large text and interface components (AA). */
export const AA_LARGE = 3;

/** The relative luminance of a `#rrggbb` color, as WCAG 2.x defines it. */
export function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** The contrast ratio of two `#rrggbb` colors, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** One foreground on one background, the ratio it reaches and the minimum it is held to. */
export interface ContrastPair {
  name: string;
  ratio: number;
  minimum: number;
}

/**
 * The theme's text and chip pairs, each with the WCAG AA minimum it is held to (036): body and
 * secondary text on the page, panels and raised surfaces; muted text (hints and labels) and the
 * accent as large text or interface color; each chip's text on its own background.
 */
export function themePairs(tokens: ThemeTokens): ContrastPair[] {
  const { color, tone } = tokens;
  const surfaces = { page: color.page, panel: color.panel, raised: color.raised };
  const pairs: ContrastPair[] = [];
  for (const [surface, background] of Object.entries(surfaces)) {
    pairs.push({
      name: `text on ${surface}`,
      ratio: contrast(color.text, background),
      minimum: AA_TEXT,
    });
    pairs.push({
      name: `secondary text on ${surface}`,
      ratio: contrast(color.textSecondary, background),
      minimum: AA_TEXT,
    });
    pairs.push({
      name: `muted text on ${surface}`,
      ratio: contrast(color.textMuted, background),
      minimum: AA_LARGE,
    });
    pairs.push({
      name: `accent on ${surface}`,
      ratio: contrast(color.accent, background),
      minimum: AA_LARGE,
    });
  }
  for (const name of [
    'neutral',
    'info',
    'success',
    'warning',
    'danger',
    'teal',
    'violet',
    'orange',
  ] as const) {
    pairs.push({
      name: `${name} chip`,
      ratio: contrast(tone[`${name}Fg`], tone[`${name}Bg`]),
      minimum: AA_TEXT,
    });
  }
  return pairs;
}
