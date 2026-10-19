import { SceneMode } from 'cesium';
import {
  applySceneMode,
  DEFAULT_SCENE_MODE,
  SCENE_MODES,
  sceneModeKey,
  type MorphableScene,
} from './sceneMode';

/** A scene stand-in that records the morph calls it receives. */
function fakeScene(mode: SceneMode): MorphableScene & { calls: string[] } {
  const calls: string[] = [];
  return {
    mode,
    calls,
    morphTo2D: (d) => calls.push(`2D:${d}`),
    morphTo3D: (d) => calls.push(`3D:${d}`),
  };
}

describe('scene modes', () => {
  it('opens in 2D and offers only 2D and 3D', () => {
    expect(DEFAULT_SCENE_MODE).toBe('2d');
    expect(SCENE_MODES).toEqual({ '2d': SceneMode.SCENE2D, '3d': SceneMode.SCENE3D });
  });

  it('reads a Cesium mode back as a map mode; morphing and Columbus view as none', () => {
    expect(sceneModeKey(SceneMode.SCENE2D)).toBe('2d');
    expect(sceneModeKey(SceneMode.SCENE3D)).toBe('3d');
    expect(sceneModeKey(SceneMode.MORPHING)).toBeUndefined();
    expect(sceneModeKey(SceneMode.COLUMBUS_VIEW)).toBeUndefined();
  });

  it('morphs to the requested mode with the given duration', () => {
    const scene = fakeScene(SceneMode.SCENE2D);
    expect(applySceneMode(scene, '3d', 0.5)).toBe(true);
    scene.mode = SceneMode.SCENE3D;
    expect(applySceneMode(scene, '2d')).toBe(true);
    expect(scene.calls).toEqual(['3D:0.5', '2D:1']);
  });

  it('does nothing when already in the requested mode', () => {
    const scene = fakeScene(SceneMode.SCENE2D);
    expect(applySceneMode(scene, '2d')).toBe(false);
    expect(scene.calls).toEqual([]);
  });
});
