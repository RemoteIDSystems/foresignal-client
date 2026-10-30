/**
 * Design tokens for the dark theme, measured from the mockups in `design/`.
 *
 * This object is the single source: `ThemeProvider` exposes each entry as a CSS custom property
 * (`--fs-<group>-<name>`), and non-DOM renderers (Cesium, deck.gl, canvas charts) read the same
 * values from `useTheme()`.
 */
export const darkTokens = {
  color: {
    page: '#01050b',
    nav: '#020a12',
    panel: '#0c141c',
    panelAlt: '#081018',
    raised: '#1a2430',
    raisedHover: '#243040',
    selected: '#384454',
    border: '#1c2834',
    borderStrong: '#2c3a4a',
    accent: '#24a8fc',
    accentStrong: '#1e88d8',
    accentSoft: '#10285a',
    text: '#e6edf5',
    textSecondary: '#a3b0bf',
    textMuted: '#7f8b99',
    live: '#3ddc97',
    liveSoft: '#082420',
    danger: '#ff5a5f',
    warning: '#f0a24a',
    success: '#3ecf8e',
  },
  /** Tag and chip colors as background/foreground pairs. */
  tone: {
    neutralBg: '#28323e',
    neutralFg: '#c5d0dc',
    infoBg: '#1c4058',
    infoFg: '#7cc4f0',
    successBg: '#14483c',
    successFg: '#5fd3a6',
    warningBg: '#48382c',
    warningFg: '#f0b070',
    dangerBg: '#4a2024',
    dangerFg: '#ff8a8f',
    tealBg: '#143838',
    tealFg: '#4fd1c5',
    violetBg: '#2e2448',
    violetFg: '#b9a2f5',
    orangeBg: '#4a2e1a',
    orangeFg: '#ff9b50',
  },
  font: {
    family: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
    sizeXs: '10.5px',
    sizeSm: '11.5px',
    sizeMd: '12.5px',
    sizeLg: '14px',
    sizeXl: '17px',
  },
  space: {
    xxs: '2px',
    xs: '4px',
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '20px',
  },
  radius: {
    sm: '3px',
    md: '5px',
    lg: '8px',
  },
  shadow: {
    panel: '0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 8px 24px rgba(0, 0, 0, 0.35)',
    overlay: '0 12px 40px rgba(0, 0, 0, 0.55)',
  },
} as const;

/**
 * Design tokens for the light theme. Same shape as {@link darkTokens}; colors are chosen so each
 * text/surface pair clears its WCAG 2.x minimum (checked with `theme/contrast.ts`), and the
 * non-color groups (font, space, radius) are shared with dark. Selected when a user's theme
 * preference is `light`, or `system` under a light OS setting (R2-007).
 */
export const lightTokens: ThemeTokens = {
  color: {
    page: '#eef2f7',
    nav: '#ffffff',
    panel: '#ffffff',
    panelAlt: '#f3f6fa',
    raised: '#e7edf4',
    raisedHover: '#dce4ee',
    selected: '#cbd8e8',
    border: '#d3dde8',
    borderStrong: '#b7c5d4',
    accent: '#0f6ad2',
    accentStrong: '#0a4f9e',
    accentSoft: '#dcebfb',
    text: '#0b1722',
    textSecondary: '#3c4a59',
    textMuted: '#5a6a79',
    live: '#0a7a50',
    liveSoft: '#dcf1e6',
    danger: '#c62828',
    warning: '#8a5200',
    success: '#0a7a50',
  },
  tone: {
    neutralBg: '#e2e8ef',
    neutralFg: '#2f3d4c',
    infoBg: '#d8e8fb',
    infoFg: '#0f5091',
    successBg: '#d3efe0',
    successFg: '#08623f',
    warningBg: '#f4e6cd',
    warningFg: '#7e4a00',
    dangerBg: '#f6dcdc',
    dangerFg: '#962020',
    tealBg: '#d0ece9',
    tealFg: '#0a6259',
    violetBg: '#e4dcfb',
    violetFg: '#53338f',
    orangeBg: '#f4e0cd',
    orangeFg: '#7f4410',
  },
  font: darkTokens.font,
  space: darkTokens.space,
  radius: darkTokens.radius,
  shadow: {
    panel: '0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 6px 18px rgba(16, 34, 58, 0.1)',
    overlay: '0 12px 40px rgba(16, 34, 58, 0.22)',
  },
};

/**
 * The shape every theme's tokens share: the groups and keys of {@link darkTokens}, each value
 * widened to `string` so a second theme (light) can supply its own values.
 */
export type ThemeTokens = {
  [Group in keyof typeof darkTokens]: Record<keyof (typeof darkTokens)[Group], string>;
};

/** Converts a camelCase token name to the kebab-case used in CSS custom properties. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Flattens tokens into CSS custom properties: `color.textMuted` becomes `--fs-color-text-muted`.
 */
export function toCssVariables(tokens: ThemeTokens): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [group, values] of Object.entries(tokens)) {
    for (const [name, value] of Object.entries(values as Record<string, string>)) {
      variables[`--fs-${kebab(group)}-${kebab(name)}`] = value;
    }
  }
  return variables;
}
