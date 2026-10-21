/** Whether the person asked their system for less motion (`prefers-reduced-motion: reduce`). */
export function prefersReducedMotion(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = typeof window !== 'undefined'
    ? window.matchMedia?.bind(window)
    : undefined,
): boolean {
  try {
    return matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * How long an animation runs, in seconds (036): `seconds`, or 0 when reduced motion is asked
 * for, so camera flights and the 2D/3D morph jump straight to where they end.
 */
export function motionSeconds(seconds: number, reduced: boolean = prefersReducedMotion()): number {
  return reduced ? 0 : seconds;
}
