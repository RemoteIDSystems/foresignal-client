import { render } from '@testing-library/react';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './context';
import { darkTokens, toCssVariables } from './tokens';

describe('theme', () => {
  it('flattens tokens into --fs-* custom properties', () => {
    const variables = toCssVariables(darkTokens);
    expect(variables['--fs-color-page']).toBe('#01050b');
    expect(variables['--fs-color-text-muted']).toBe(darkTokens.color.textMuted);
    expect(variables['--fs-tone-warning-bg']).toBe(darkTokens.tone.warningBg);
  });

  it('publishes the variables on the document root and provides the theme', () => {
    let seen = '';
    const Probe = () => {
      seen = useTheme().name;
      return null;
    };
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(seen).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--fs-color-accent')).toBe('#24a8fc');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
