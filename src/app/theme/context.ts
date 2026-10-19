import { createContext, useContext } from 'react';
import { darkTokens, type ThemeTokens } from './tokens';

/** The active theme: its name and its tokens. */
export interface Theme {
  /** Theme identifier; only `dark` exists today. */
  name: 'dark';
  /** The theme's design tokens. */
  tokens: ThemeTokens;
}

/** The default theme. */
export const darkTheme: Theme = { name: 'dark', tokens: darkTokens };

/** Carries the active theme to components and non-DOM renderers. */
export const ThemeContext = createContext<Theme>(darkTheme);

/** Returns the active theme. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
