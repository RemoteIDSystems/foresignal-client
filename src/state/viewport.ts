import { useSyncExternalStore } from 'react';
import { appStore, type AppState, type Store } from './store';

/**
 * The map's committed viewport: what it shows once the camera has come to rest. `bbox` is
 * `[west, south, east, north]` in degrees; `west` is greater than `east` when the view crosses
 * the antimeridian. `zoom` is the MapLibre zoom at the view's center.
 */
export interface CommittedViewport {
  bbox: [number, number, number, number];
  zoom: number;
}

/** The whole world, for a view that shows the whole globe. */
export const WORLD_BBOX: CommittedViewport['bbox'] = [-180, -90, 180, 90];

/** Decimal places a committed bbox keeps: about 100 m, so a still camera commits nothing new. */
const BBOX_PLACES = 3;

/**
 * The committed viewport for a view rectangle and zoom; the whole world when there is no
 * rectangle (the globe and the space around it). Rounded outward to {@link BBOX_PLACES} places,
 * so the same view gives the same value and the backend's per-context cache can answer it, while
 * the box still covers the whole view and never shrinks to nothing, however far in the map is.
 */
export function committedViewport(
  rect: { west: number; south: number; east: number; north: number } | undefined,
  zoom: number,
): CommittedViewport {
  if (!rect) return { bbox: WORLD_BBOX, zoom: Number(zoom.toFixed(1)) };
  const scale = 10 ** BBOX_PLACES;
  const step = 1 / scale;
  // A value already on the grid stays put despite floating-point error (−122.1 × 1000 is not
  // quite −122100).
  const down = (value: number) => Math.floor(value * scale + 1e-9) / scale;
  const up = (value: number) => Math.ceil(value * scale - 1e-9) / scale;
  const west = down(clamp(rect.west, -180, 180));
  let east = up(clamp(rect.east, -180, 180));
  const south = down(clamp(rect.south, -90, 90));
  let north = up(clamp(rect.north, -90, 90));
  if (east === west) east = Math.min(180, Number((west + step).toFixed(BBOX_PLACES)));
  if (north === south) north = Math.min(90, Number((south + step).toFixed(BBOX_PLACES)));
  return { bbox: [west, south, east, north], zoom: Number(zoom.toFixed(1)) };
}

/**
 * The viewport as boxes that never cross the antimeridian: itself, or its two halves when it
 * does. The backend reads a box with `west` greater than `east` as the band between them, not
 * across the dateline, so a crossing view is asked about in two parts.
 */
export function splitAtAntimeridian(bbox: CommittedViewport['bbox']): CommittedViewport['bbox'][] {
  const [west, south, east, north] = bbox;
  if (west <= east) return [bbox];
  return [
    [west, south, 180, north],
    [-180, south, east, north],
  ];
}

/** A subscribable holder for the {@link CommittedViewport}. */
export interface ViewportStore {
  /** The current viewport; undefined until the map first commits one. */
  get(): CommittedViewport | undefined;
  /** Calls `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Publishes a viewport, unless it is the one held already. */
  commit(viewport: CommittedViewport): void;
}

/** Creates an empty {@link ViewportStore}. */
export function createViewportStore(): ViewportStore {
  let snapshot: CommittedViewport | undefined;
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    commit(viewport) {
      if (snapshot && sameViewport(snapshot, viewport)) return;
      snapshot = viewport;
      listeners.forEach((listener) => listener());
    },
  };
}

/** True when two viewports are the same box at the same zoom. */
function sameViewport(a: CommittedViewport, b: CommittedViewport): boolean {
  return a.zoom === b.zoom && a.bbox.every((value, index) => value === b.bbox[index]);
}

/** Clamps a value to a range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A {@link ViewportStore} over a key of a keyed {@link Store}: committing writes the key (an
 * equal viewport changes nothing), and subscribers hear only that key.
 */
export function viewportOf(store: Store<AppState>): ViewportStore {
  return {
    get: () => store.get('viewport'),
    subscribe: (listener) => store.subscribe('viewport', listener),
    commit: (viewport) => store.set('viewport', viewport),
  };
}

/**
 * The app-wide viewport: the `viewport` key of the app store (012). The main map commits to it;
 * summaries, panels and the live stream's filter read it.
 */
export const viewportStore = viewportOf(appStore);

/** Subscribes a component to the committed viewport. */
export function useCommittedViewport(
  store: ViewportStore = viewportStore,
): CommittedViewport | undefined {
  return useSyncExternalStore(store.subscribe, store.get);
}
