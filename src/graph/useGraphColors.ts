import { useMemo } from 'react';
import { useTheme } from '../app/theme';
import { familyColors, groupColors } from './graphView';
import type { GraphColors } from './sigmaGraph';

/** The theme's graph colors, kept while the theme does not change. */
export function useGraphColors(): GraphColors {
  const tokens = useTheme().tokens;
  return useMemo(() => ({ groups: groupColors(tokens), families: familyColors(tokens) }), [tokens]);
}
