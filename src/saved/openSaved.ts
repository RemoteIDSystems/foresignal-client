import { locateRequest } from '../search/locate';
import type { AppState, Store } from '../state/store';
import type { Place, SavedView } from './savedApi';
import { flyToPlace, flyToView } from './savedView';

/**
 * Opens a saved view on the map (031): it is drawn in place of the kinds' layers, the rail's kinds
 * are the view's (so closing it keeps the same layers), the map moves to its box, and the dialog
 * closes. The caller then shows the Global map.
 */
export function openViewOnMap(store: Store<AppState>, view: SavedView): void {
  store.batch(() => {
    store.merge('layers', {
      view: view.id,
      ...(view.kinds && view.kinds.length > 0 ? { kinds: [...view.kinds].sort() } : {}),
    });
    const fly = flyToView(view);
    if (fly) store.set('locate', locateRequest(fly.longitude, fly.latitude, fly.height));
    store.set('savedOpen', undefined);
  });
}

/** Moves the map to a place and closes the dialog; false when the place has no position. */
export function flyToPlaceOnMap(store: Store<AppState>, place: Place): boolean {
  const fly = flyToPlace(place);
  if (!fly) return false;
  store.batch(() => {
    store.set('locate', locateRequest(fly.longitude, fly.latitude, fly.height));
    store.set('savedOpen', undefined);
  });
  return true;
}
