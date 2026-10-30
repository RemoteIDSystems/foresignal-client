import { useLayoutEffect, type ReactNode } from 'react';
import { darkTheme, ThemeContext, type Theme } from './context';
import { toCssVariables } from './tokens';

/**
 * Provides the theme to the tree and publishes its tokens as CSS custom properties on the
 * document root, so stylesheets and portals (modals, toasts) see the same values.
 */
export function ThemeProvider({
  theme = darkTheme,
  children,
}: {
  theme?: Theme;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const variables = toCssVariables(theme.tokens);
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }
    root.dataset.theme = theme.name;
    root.style.colorScheme = theme.name;
  }, [theme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
