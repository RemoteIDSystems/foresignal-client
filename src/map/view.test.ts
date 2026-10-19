import { Cartographic, Color, Math as CesiumMath, type Viewer as CesiumViewer } from 'cesium';
import { HOME_VIEW, homeDestination, styleScene } from './view';

describe('view', () => {
  it('places the home destination at the home longitude, latitude and height', () => {
    const home = Cartographic.fromCartesian(homeDestination());
    expect(CesiumMath.toDegrees(home.longitude)).toBeCloseTo(HOME_VIEW.longitude, 6);
    expect(CesiumMath.toDegrees(home.latitude)).toBeCloseTo(HOME_VIEW.latitude, 6);
    expect(home.height).toBeCloseTo(HOME_VIEW.height, 0);
  });

  it('colors space and the bare globe with the dark theme', () => {
    const viewer = { scene: { backgroundColor: Color.WHITE, globe: { baseColor: Color.WHITE } } };
    styleScene(viewer as unknown as CesiumViewer);
    expect(viewer.scene.backgroundColor.toCssHexString()).toBe('#02060c');
    expect(viewer.scene.globe.baseColor.toCssHexString()).toBe('#0b1a2a');
  });
});
