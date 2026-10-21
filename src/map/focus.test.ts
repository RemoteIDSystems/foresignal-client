import { Math as CesiumMath, Rectangle } from 'cesium';
import { expandCell } from './focus';

describe('expandCell', () => {
  it('flies to fit the cell, and does nothing once the viewer is gone', () => {
    const flyTo = vi.fn();
    const viewer = { camera: { flyTo }, isDestroyed: () => false };
    expandCell(viewer as unknown as Parameters<typeof expandCell>[0], [-10, 20, 5, 30]);
    expect(flyTo).toHaveBeenCalledTimes(1);
    const destination = flyTo.mock.calls[0]![0].destination as Rectangle;
    expect(destination).toBeInstanceOf(Rectangle);
    expect(CesiumMath.toDegrees(destination.west)).toBeCloseTo(-10, 9);
    expect(CesiumMath.toDegrees(destination.south)).toBeCloseTo(20, 9);
    expect(CesiumMath.toDegrees(destination.east)).toBeCloseTo(5, 9);
    expect(CesiumMath.toDegrees(destination.north)).toBeCloseTo(30, 9);

    const gone = { camera: { flyTo }, isDestroyed: () => true };
    expandCell(gone as unknown as Parameters<typeof expandCell>[0], [0, 0, 1, 1]);
    expect(flyTo).toHaveBeenCalledTimes(1);
  });
});
