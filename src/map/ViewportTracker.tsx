import { SceneMode } from 'cesium';
import { useEffect } from 'react';
import { useCesium } from 'resium';
import { committedViewport, type ViewportStore } from '../state/viewport';
import { readRecordView } from './records/recordLayers';

/** How long the camera must rest before its view is committed, in ms. */
export const VIEWPORT_SETTLE_MS = 300;

/**
 * Lives inside the Resium viewer and commits the map's viewport (bbox and zoom) to the store
 * whenever the camera comes to rest, after a 2D/3D switch, and once at start. Debounced, so a
 * drag or a flight commits once, at its end. Renders nothing.
 */
export function ViewportTracker({ store }: { store: ViewportStore }) {
  const { viewer } = useCesium();
  useEffect(() => {
    if (!viewer) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Mid-morph the camera is between projections; morphComplete schedules a fresh read.
        if (viewer.isDestroyed() || viewer.scene.mode === SceneMode.MORPHING) return;
        const view = readRecordView(viewer);
        store.commit(committedViewport(view.rect, view.zoom));
      }, VIEWPORT_SETTLE_MS);
    };
    const removers = [
      viewer.camera.moveEnd.addEventListener(schedule),
      viewer.scene.morphComplete.addEventListener(schedule),
    ];
    schedule();
    return () => {
      clearTimeout(timer);
      removers.forEach((remove) => remove());
    };
  }, [viewer, store]);
  return null;
}
