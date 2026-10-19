import { SceneMode } from 'cesium';
import { applySceneMode, SCENE_MODES, sceneModeKey, type MorphableScene } from './sceneMode';

/** A scene stand-in that records the morph calls it receives. */
function fakeScene(mode: SceneMode): MorphableScene & { calls: string[] } {
  const calls: string[] = [];
  return {
    mode,
    calls,
    morphTo2D: (d) => calls.push(`2D:${d}`),
    morphTo3D: (d) => calls.push(`3D:${d}`),
    morphToColumbusView: (d) => calls.push(`CV:${d}`),
  };
}

describe('scene modes', () => {
  it('maps 2D Map, 3D Globe and Split to Cesium modes, Split as Columbus view', () => {
    expect(SCENE_MODES['2d']).toBe(SceneMode.SCENE2D);
    expect(SCENE_MODES['3d']).toBe(SceneMode.SCENE3D);
    expect(SCENE_MODES.split).toBe(SceneMode.COLUMBUS_VIEW);
  });

  it('reads a Cesium mode back as a design mode, and morphing as none', () => {
    expect(sceneModeKey(SceneMode.SCENE2D)).toBe('2d');
    expect(sceneModeKey(SceneMode.COLUMBUS_VIEW)).toBe('split');
    expect(sceneModeKey(SceneMode.MORPHING)).toBeUndefined();
  });

  it('morphs to the requested mode with the given duration', () => {
    const scene = fakeScene(SceneMode.SCENE3D);
    expect(applySceneMode(scene, '2d', 0.5)).toBe(true);
    expect(applySceneMode(scene, 'split')).toBe(true);
    expect(scene.calls).toEqual(['2D:0.5', 'CV:1']);
  });

  it('does nothing when already in the requested mode', () => {
    const scene = fakeScene(SceneMode.SCENE3D);
    expect(applySceneMode(scene, '3d')).toBe(false);
    expect(scene.calls).toEqual([]);
  });
});
