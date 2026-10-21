import { useEffect } from 'react';
import { useCesium } from 'resium';
import { adaptMsaa } from './adaptMsaa';

/**
 * Lives inside the Resium viewer and draws its scene with MSAA by zoom ({@link adaptMsaa}): none
 * at the world and continental overview, the shipped 4× closer in. Renders nothing.
 */
export function AdaptiveMsaa() {
  const { viewer } = useCesium();
  useEffect(() => (viewer ? adaptMsaa(viewer) : undefined), [viewer]);
  return null;
}
