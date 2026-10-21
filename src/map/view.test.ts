import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Ellipsoid,
  Rectangle,
  Math as CesiumMath,
  SceneMode,
  type Viewer as CesiumViewer,
} from 'cesium';
import { BASEMAP_METERS_PER_PIXEL } from './imagery';
import { detailMetersPerPixel } from './basemapStyle';
import {
  HOME_VIEW,
  homeDestination,
  MAX_BASEMAP_UPSCALE,
  sharpestDistance,
  sharpestDistanceOf,
  zoomInAmount,
  styleScene,
  switchSceneMode,
  VERTICAL_EXAGGERATION,
  visibleRectangle,
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

describe('visibleRectangle', () => {
  /**
   * A viewer stand-in on a 1000×500 canvas. In 2D, `ground(x, y)` says where a canvas pixel lands
   * on the map (undefined past its edge); in 3D, `rectangle` is what Cesium computes.
   */
  function fakeViewer(
    mode: SceneMode,
    ground: (x: number, y: number) => [number, number] | undefined,
    rectangle?: Rectangle,
  ) {
    return {
      scene: {
        mode,
        canvas: { clientWidth: 1000, clientHeight: 500 },
        globe: { ellipsoid: Ellipsoid.WGS84 },
      },
      camera: {
        pickEllipsoid: (pixel: Cartesian2) => {
          const point = ground(pixel.x, pixel.y);
          return point && Cartesian3.fromDegrees(point[0], point[1]);
        },
        computeViewRectangle: () => rectangle,
      },
    } as unknown as CesiumViewer;
  }

  /** A flat map 20 degrees wide and 10 tall, centered on a longitude. */
  const flat =
    (centerLongitude: number) =>
    (x: number, y: number): [number, number] => {
      const longitude = centerLongitude - 10 + (x / 1000) * 20;
      return [((((longitude + 180) % 360) + 360) % 360) - 180, 35 - (y / 500) * 10];
    };

  it('reads the 2D view from the map under the canvas corners', () => {
    const rect = visibleRectangle(fakeViewer(SceneMode.SCENE2D, flat(-80)))!;
    expect(rect.west).toBeCloseTo(-90, 6);
    expect(rect.east).toBeCloseTo(-70, 6);
    expect(rect.south).toBeCloseTo(25, 6);
    expect(rect.north).toBeCloseTo(35, 6);
  });

  it('reads a 2D view scrolled across the antimeridian as crossing it', () => {
    const rect = visibleRectangle(fakeViewer(SceneMode.SCENE2D, flat(178)))!;
    expect(rect.west).toBeCloseTo(168, 6);
    expect(rect.east).toBeCloseTo(-172, 6);
  });

  it('gives the whole world when the 2D map’s edge is in view', () => {
    const edge = (x: number, y: number) => (y < 50 ? undefined : flat(0)(x, y));
    expect(visibleRectangle(fakeViewer(SceneMode.SCENE2D, edge))).toEqual({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    });
  });

  it('uses Cesium’s rectangle in 3D, in degrees, and nothing when it sees no globe', () => {
    const rect = visibleRectangle(
      fakeViewer(SceneMode.SCENE3D, () => undefined, Rectangle.fromDegrees(-100, 10, -60, 50)),
    )!;
    expect([rect.west, rect.south, rect.east, rect.north].map((v) => Math.round(v))).toEqual([
      -100, 10, -60, 50,
    ]);
    expect(visibleRectangle(fakeViewer(SceneMode.SCENE3D, () => undefined))).toBeUndefined();
  });
});

describe('the sharp-basemap limit', () => {
  it('keeps the basemap at most twice its own resolution: 2D by span, 3D by height', () => {
    // 16,384 pixels around the equator at level 5: about 2.45 km each.
    expect(BASEMAP_METERS_PER_PIXEL).toBeCloseTo(40_075_016.686 / 16_384, 6);
    const span = (1_438 * BASEMAP_METERS_PER_PIXEL) / MAX_BASEMAP_UPSCALE;
    expect(
      sharpestDistance(SceneMode.SCENE2D, 1_438, undefined, BASEMAP_METERS_PER_PIXEL),
    ).toBeCloseTo(span, 6);
    expect(span / 1000).toBeCloseTo(1_758.7, 1);
    // A 60° field of view spans 2·tan(30°) ≈ 1.155 times the height.
    const fov = CesiumMath.toRadians(60);
    expect(sharpestDistance(SceneMode.SCENE3D, 1_438, fov, BASEMAP_METERS_PER_PIXEL)).toBeCloseTo(
      span / (2 * Math.tan(fov / 2)),
      6,
    );
  });

  it('reads the limit from the canvas in CSS pixels, its longer side, and the mode', () => {
    const viewer = (mode: SceneMode) =>
      ({
        scene: { mode, canvas: { clientWidth: 900, clientHeight: 1_200 } },
        camera: { frustum: { fov: CesiumMath.toRadians(60) } },
      }) as unknown as CesiumViewer;
    expect(sharpestDistanceOf(viewer(SceneMode.SCENE2D), 2)).toBeCloseTo(
      sharpestDistance(SceneMode.SCENE2D, 1_200, undefined, 2),
      6,
    );
    expect(sharpestDistanceOf(viewer(SceneMode.SCENE3D), 2)).toBeCloseTo(
      sharpestDistance(SceneMode.SCENE3D, 1_200, CesiumMath.toRadians(60), 2),
      6,
    );
  });

  it("lets the camera close in to the detailed basemap's deepest level (038)", () => {
    // OpenStreetMap's level 19 across 1,438 pixels at twice its resolution: about 215 m of span,
    // where the NASA overview alone stopped it at about 1,759 km.
    const span = sharpestDistance(SceneMode.SCENE2D, 1_438, undefined, detailMetersPerPixel(19));
    expect(span).toBeCloseTo(214.7, 1);
    // Esri's deeper levels, as its service declares them, go closer still.
    expect(
      sharpestDistance(SceneMode.SCENE2D, 1_438, undefined, detailMetersPerPixel(23)),
    ).toBeLessThan(span / 15);
  });

  it('stops a zoom-in at the minimum and never turns it into a zoom-out', () => {
    expect(zoomInAmount(400, 1_000, 100)).toBe(400);
    expect(zoomInAmount(400, 300, 100)).toBe(200);
    expect(zoomInAmount(400, 80, 100)).toBe(0);
  });
});
