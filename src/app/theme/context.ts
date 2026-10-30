import { createContext, useContext } from 'react';
import { darkTokens, lightTokens, type ThemeTokens } from './tokens';

/** The themes the app can resolve to and render. `system` is not a theme; it resolves to one. */
export type ThemeName = 'light' | 'dark';

/** The active theme: its name and its tokens. */
export interface Theme {
  /** Theme identifier. */
  name: ThemeName;
  /** The theme's design tokens. */
  tokens: ThemeTokens;
}

/** The dark theme (the app's default). */
export const darkTheme: Theme = { name: 'dark', tokens: darkTokens };

/** The light theme. */
export const lightTheme: Theme = { name: 'light', tokens: lightTokens };

/**
 * The resolved theme for a user's `theme` preference: `light`/`dark` pick that theme; `system`
 * (and an unset or unknown value) follows the OS, defaulting to dark when `prefersDark` is not
 * supplied. Returns the shared theme singletons, so an unchanged choice keeps the same reference
 * and {@link ThemeProvider}'s effect does not re-run.
 */
export function resolveTheme(choice: string | null | undefined, prefersDark = true): Theme {
  if (choice === 'light') return lightTheme;
  if (choice === 'dark') return darkTheme;
  return prefersDark ? darkTheme : lightTheme;
}

/** Carries the active theme to components and non-DOM renderers. */
export const ThemeContext = createContext<Theme>(darkTheme);

/** Returns the active theme. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
