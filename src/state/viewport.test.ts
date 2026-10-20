// @vitest-environment node
import {
  committedViewport,
  createViewportStore,
  splitAtAntimeridian,
  WORLD_BBOX,
} from './viewport';

describe('committedViewport', () => {
  it('rounds the view’s rectangle and zoom, and is the world without one', () => {
    expect(
      committedViewport({ west: -122.41941, south: 37.7, east: -122.1, north: 37.912345 }, 9.4567),
    ).toEqual({ bbox: [-122.42, 37.7, -122.1, 37.913], zoom: 9.5 });
    expect(committedViewport(undefined, 0)).toEqual({ bbox: WORLD_BBOX, zoom: 0 });
  });

  it('rounds outward, so a view far in never collapses to an empty box', () => {
    const point = { west: -80.00012, south: 28.00004, east: -80.00011, north: 28.00005 };
    expect(committedViewport(point, 22).bbox).toEqual([-80.001, 28, -80, 28.001]);
    const exact = { west: 10, south: 20, east: 10, north: 20 };
    expect(committedViewport(exact, 22).bbox).toEqual([10, 20, 10.001, 20.001]);
  });

  it('clamps to the world', () => {
    expect(committedViewport({ west: -200, south: -95, east: 10, north: 91 }, 1).bbox).toEqual([
      -180, -90, 10, 90,
    ]);
  });
});

describe('splitAtAntimeridian', () => {
  it('keeps a box that does not cross, and halves one that does', () => {
    expect(splitAtAntimeridian([-10, -5, 10, 5])).toEqual([[-10, -5, 10, 5]]);
    expect(splitAtAntimeridian([170, -60, -170, 60])).toEqual([
      [170, -60, 180, 60],
      [-180, -60, -170, 60],
    ]);
  });
});

describe('createViewportStore', () => {
  it('publishes a new viewport and ignores the same one again', () => {
    const store = createViewportStore();
    const heard: unknown[] = [];
    const stop = store.subscribe(() => heard.push(store.get()));
    expect(store.get()).toBeUndefined();
    store.commit({ bbox: [0, 0, 1, 1], zoom: 3 });
    store.commit({ bbox: [0, 0, 1, 1], zoom: 3 });
    store.commit({ bbox: [0, 0, 1, 1], zoom: 4 });
    expect(heard).toHaveLength(2);
    stop();
    store.commit({ bbox: [0, 0, 2, 2], zoom: 4 });
    expect(heard).toHaveLength(2);
  });
});
