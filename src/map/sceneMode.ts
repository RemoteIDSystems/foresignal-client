import { SceneMode } from 'cesium';

/** The map's two modes: the 2D map (the default) and the 3D globe. There is no Split mode. */
export type SceneModeKey = '2d' | '3d';

/** The mode the map opens in. */
export const DEFAULT_SCENE_MODE: SceneModeKey = '2d';

/** Cesium scene mode for each map mode. */
export const SCENE_MODES: Record<SceneModeKey, SceneMode> = {
  '2d': SceneMode.SCENE2D,
  '3d': SceneMode.SCENE3D,
};

/** The map mode for a Cesium scene mode; `MORPHING` and Columbus view report as undefined. */
export function sceneModeKey(mode: SceneMode): SceneModeKey | undefined {
  return (Object.keys(SCENE_MODES) as SceneModeKey[]).find((key) => SCENE_MODES[key] === mode);
}

/** The scene members used to change mode; matches `Scene` from Cesium. */
export interface MorphableScene {
  /** Current mode. */
  mode: SceneMode;
  /** Morphs to the flat 2D map. */
  morphTo2D(duration?: number): void;
  /** Morphs to the 3D globe. */
  morphTo3D(duration?: number): void;
}

/**
 * Morphs `scene` to the requested map mode over `duration` seconds. Returns false when the scene
 * is already in that mode.
 */
export function applySceneMode(scene: MorphableScene, key: SceneModeKey, duration = 1): boolean {
  if (scene.mode === SCENE_MODES[key]) return false;
  if (key === '2d') scene.morphTo2D(duration);
  else scene.morphTo3D(duration);
  return true;
}
