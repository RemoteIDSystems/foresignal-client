import { SceneMode } from 'cesium';

/** The design's map modes: 2D Map, 3D Globe and Split. */
export type SceneModeKey = '2d' | '3d' | 'split';

/**
 * Cesium scene mode for each design mode. "Split" is Columbus view (2.5D), per
 * Architecture §5.
 */
export const SCENE_MODES: Record<SceneModeKey, SceneMode> = {
  '2d': SceneMode.SCENE2D,
  '3d': SceneMode.SCENE3D,
  split: SceneMode.COLUMBUS_VIEW,
};

/** The design mode for a Cesium scene mode; `MORPHING` reports as undefined. */
export function sceneModeKey(mode: SceneMode): SceneModeKey | undefined {
  return (Object.keys(SCENE_MODES) as SceneModeKey[]).find((key) => SCENE_MODES[key] === mode);
}

/** The scene methods used to change mode; matches `Scene` from Cesium. */
export interface MorphableScene {
  /** Current mode. */
  mode: SceneMode;
  /** Morphs to the flat 2D map. */
  morphTo2D(duration?: number): void;
  /** Morphs to the 3D globe. */
  morphTo3D(duration?: number): void;
  /** Morphs to Columbus view (2.5D). */
  morphToColumbusView(duration?: number): void;
}

/**
 * Morphs `scene` to the requested design mode over `duration` seconds. Returns false when the
 * scene is already in that mode.
 */
export function applySceneMode(scene: MorphableScene, key: SceneModeKey, duration = 1): boolean {
  if (scene.mode === SCENE_MODES[key]) return false;
  if (key === '2d') scene.morphTo2D(duration);
  else if (key === '3d') scene.morphTo3D(duration);
  else scene.morphToColumbusView(duration);
  return true;
}
