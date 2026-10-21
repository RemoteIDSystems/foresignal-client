/** The prefix of a saved view's layer id: `view:<viewId>` (031). */
export const VIEW_LAYER_PREFIX = 'view:';

/** The record layer id that draws a saved view from its own tiles. */
export function viewLayerId(viewId: string): string {
  return `${VIEW_LAYER_PREFIX}${viewId}`;
}

/** The saved view a layer id draws, or undefined for a kind's layer. */
export function viewIdOf(layer: string): string | undefined {
  return layer.startsWith(VIEW_LAYER_PREFIX) ? layer.slice(VIEW_LAYER_PREFIX.length) : undefined;
}
