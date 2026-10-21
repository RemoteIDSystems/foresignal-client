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

/** The shape every theme's tokens share. */
export type ThemeTokens = typeof darkTokens;

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
