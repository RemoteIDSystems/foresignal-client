/** The constellation as the end-to-end checks reach it: what is drawn, and where on the canvas. */
export interface SatelliteProbe {
  /** The satellites drawn. */
  count: number;
  /** Where a satellite shows on the canvas, in CSS pixels; undefined off screen or not drawn. */
  screenOf(norad: number): { x: number; y: number } | undefined;
  /** Puts the camera above a satellite, looking down at it; false when it is not drawn. */
  view(norad: number): boolean;
}

declare global {
  interface Window {
    /** The constellation, in development builds, for the end-to-end checks. */
    __foresignalSatellites?: SatelliteProbe;
  }
}

/**
 * Puts the constellation on `window.__foresignalSatellites` (or clears it with undefined). The
 * layer calls this in development builds only, so production builds expose nothing.
 */
export function registerSatellites(probe: SatelliteProbe | undefined): void {
  window.__foresignalSatellites = probe;
}
