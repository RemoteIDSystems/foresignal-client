import { Rectangle, SceneMode, type Viewer } from 'cesium';
import type { DrawnTotals, LayerChange, RecordLayerSet } from '../records/recordLayerSet';
import { frameStats, type FrameStats } from './frameStats';

/** The query parameter that turns the stress harness on, in development builds. */
export const STRESS_PARAMETER = 'stress';

/** True in a development build whose address carries `?stress`. */
export function stressModeOn(search: string = window.location.search): boolean {
  return import.meta.env.DEV && new URLSearchParams(search).has(STRESS_PARAMETER);
}

/** How long a measurement pans the map, in ms. */
export const MEASURE_MS = 5_000;

/** How long a measurement waits for a toggled layer to draw again, in ms. */
const TOGGLE_TIMEOUT_MS = 10_000;

/** One measurement: what was drawn, the frame timing while panning, and a layer toggle. */
export interface StressResult {
  totals: DrawnTotals;
  frames: FrameStats;
  /** The scene mode measured in. */
  mode: '2D' | '3D';
  /** Turning one layer off, then on again (drawn from the shared cache). */
  toggle?: {
    layer: string;
    off: LayerChange;
    on: LayerChange;
    /** Ms from turning it back on until it drew what it drew before. */
    redrawnMs: number;
  };
}

/** Moves the camera to the whole world, in either mode. */
export function worldView(viewer: Viewer): void {
  viewer.camera.setView({ destination: Rectangle.fromDegrees(-180, -80, 180, 80) });
}

/**
 * Pans the map for `ms` (rotating the globe in 3D, sliding the map in 2D, turning back every
 * second) and records when each frame was rendered. Panning keeps the view moving, so no tiles are
 * fetched meanwhile: the timing is the cost of drawing what is on the map.
 */
export function measureFrames(viewer: Viewer, ms = MEASURE_MS): Promise<FrameStats> {
  const { scene, camera } = viewer;
  return new Promise((resolve) => {
    const times: number[] = [];
    const start = performance.now();
    const remove = scene.postRender.addEventListener(() => {
      const now = performance.now();
      times.push(now);
      const way = Math.floor((now - start) / 1000) % 2 === 0 ? 1 : -1;
      if (scene.mode === SceneMode.SCENE3D) camera.rotateRight(way * 0.004);
      else camera.moveRight(way * camera.positionCartographic.height * 0.004);
      if (now - start >= ms) {
        remove();
        resolve(frameStats(times));
      }
    });
  });
}

/**
 * Turns one layer off and back on directly on the set, timing each change and how long the layer
 * takes to draw again (from the shared tile cache), then leaves it on.
 */
export async function measureToggle(
  layers: RecordLayerSet,
  ids: readonly string[],
): Promise<StressResult['toggle']> {
  const counts = layers.counts();
  const layer = ids.find((id) => (counts[id] ?? 0) > 0) ?? ids[0];
  if (!layer) return undefined;
  const before = layers.totals();
  layers.setLayers(ids.filter((id) => id !== layer));
  const off = layers.lastChange!;
  await nextFrame();
  const start = performance.now();
  layers.setLayers(ids);
  const on = layers.lastChange!;
  for (;;) {
    const now = layers.totals();
    if (
      (now.features >= before.features && now.cells >= before.cells && !now.building) ||
      performance.now() - start > TOGGLE_TIMEOUT_MS
    )
      break;
    await nextFrame();
  }
  return { layer, off, on, redrawnMs: performance.now() - start };
}

/** Resolves on the next animation frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
