import {
  Cartographic,
  Color,
  Math as CesiumMath,
  SceneMode,
  type Cartesian3,
  type Viewer as CesiumViewer,
} from 'cesium';
import {
  HOME_VIEW,
  homeDestination,
  styleScene,
  switchSceneMode,
  VERTICAL_EXAGGERATION,
} from './view';

describe('view', () => {
  it('places the home destination at the home longitude, latitude and height', () => {
    const home = Cartographic.fromCartesian(homeDestination());
    expect(CesiumMath.toDegrees(home.longitude)).toBeCloseTo(HOME_VIEW.longitude, 6);
    expect(CesiumMath.toDegrees(home.latitude)).toBeCloseTo(HOME_VIEW.latitude, 6);
    expect(home.height).toBeCloseTo(HOME_VIEW.height, 0);
  });

  it('colors space and the bare globe with the dark theme, lights it by the sun and raises relief', () => {
    const viewer = {
      scene: {
        verticalExaggeration: 1,
        backgroundColor: Color.WHITE,
        globe: { baseColor: Color.WHITE, enableLighting: false },
      },
    };
    styleScene(viewer as unknown as CesiumViewer);
    expect(viewer.scene.backgroundColor.toCssHexString()).toBe('#02060c');
    expect(viewer.scene.globe.baseColor.toCssHexString()).toBe('#0b1a2a');
    expect(viewer.scene.globe.enableLighting).toBe(true);
    expect(VERTICAL_EXAGGERATION).toBe(2);
    expect(viewer.scene.verticalExaggeration).toBe(VERTICAL_EXAGGERATION);
  });
});

describe('switchSceneMode', () => {
  /** A viewer stand-in whose morph completes when `finish()` is called. */
  function fakeViewer(mode: SceneMode) {
    const listeners = new Set<() => void>();
    const morphs: string[] = [];
    const views: Cartographic[] = [];
    const viewer = {
      scene: {
        mode,
        morphTo2D: () => morphs.push('2D'),
        morphTo3D: () => morphs.push('3D'),
        morphComplete: {
          addEventListener: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
      },
      camera: {
        setView: ({ destination }: { destination: Cartesian3 }) =>
          views.push(Cartographic.fromCartesian(destination)),
      },
    };
    const finish = () => [...listeners].forEach((listener) => listener());
    return { viewer, morphs, views, listeners, finish };
  }

  const florida = { longitude: -80, latitude: 28, height: 13_000_000 };

  it('morphs, then puts the camera back over the same place at the same height', () => {
    const { viewer, morphs, views, listeners, finish } = fakeViewer(SceneMode.SCENE2D);
    expect(switchSceneMode(viewer, '3d', florida)).toBe(true);
    expect(morphs).toEqual(['3D']);
    expect(views).toEqual([]);
    finish();
    expect(views).toHaveLength(1);
    expect(CesiumMath.toDegrees(views[0]!.longitude)).toBeCloseTo(-80, 6);
    expect(CesiumMath.toDegrees(views[0]!.latitude)).toBeCloseTo(28, 6);
    expect(views[0]!.height).toBeCloseTo(13_000_000, 0);
    expect(listeners.size).toBe(0);
  });

  it('leaves no listener behind when already in the requested mode', () => {
    const { viewer, morphs, listeners } = fakeViewer(SceneMode.SCENE3D);
    expect(switchSceneMode(viewer, '3d', florida)).toBe(false);
    expect(morphs).toEqual([]);
    expect(listeners.size).toBe(0);
  });

  it('morphs without moving the camera when there is no place to keep', () => {
    const { viewer, morphs, views, listeners, finish } = fakeViewer(SceneMode.SCENE3D);
    expect(switchSceneMode(viewer, '2d', undefined)).toBe(true);
    finish();
    expect(morphs).toEqual(['2D']);
    expect(views).toEqual([]);
    expect(listeners.size).toBe(0);
  });
});
