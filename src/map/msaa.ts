/** Multisample antialiasing when zoomed in: Cesium's default, as shipped. */
export const DETAIL_MSAA = 4;

/**
 * Multisample antialiasing at the world and continental overview: none. On the 035 GPU probe
 * (2026-10-21, Radeon 780M) the World view with every layer on took 28.7 ms of GPU time a frame
 * at 4× (the cost is the translucent cell pass under MSAA) and 14.1 ms at 1×, at 60 fps.
 */
export const OVERVIEW_MSAA = 1;

/** Below this map zoom the view is an overview and is drawn with {@link OVERVIEW_MSAA}. */
export const OVERVIEW_BELOW_ZOOM = 4;

/**
 * At or above this map zoom an overview is drawn with {@link DETAIL_MSAA} again: higher than
 * {@link OVERVIEW_BELOW_ZOOM}, so a view resting near it does not switch back and forth.
 */
export const DETAIL_FROM_ZOOM = 4.5;

/**
 * The MSAA samples for a view at map `zoom`, given the samples it is drawn with now: an overview
 * below {@link OVERVIEW_BELOW_ZOOM} gets {@link OVERVIEW_MSAA}, a view at or above
 * {@link DETAIL_FROM_ZOOM} gets {@link DETAIL_MSAA}, and one between them keeps what it has.
 */
export function msaaForZoom(zoom: number, current: number): number {
  if (zoom < OVERVIEW_BELOW_ZOOM) return OVERVIEW_MSAA;
  if (zoom >= DETAIL_FROM_ZOOM) return DETAIL_MSAA;
  return current === OVERVIEW_MSAA ? OVERVIEW_MSAA : DETAIL_MSAA;
}
