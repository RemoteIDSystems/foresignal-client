// @vitest-environment node
import { Event, ImageryLayer, ImageryLayerCollection, SceneMode } from 'cesium';
import { BasemapHandOff, SWAP_TIMEOUT_MS, type HandOffViewer } from './basemapHandOff';
import { createDetailLayer, type DetailSource } from './basemapStyle';
import { createBaseLayers } from './imagery';

/** A viewer with real camera and globe events and a real layer collection, at a set zoom. */
function fakeViewer() {
  const view = { zoom: 2, destroyed: false };
  const viewer = {
    camera: { changed: new Event(), moveEnd: new Event() },
    scene: {
      mode: SceneMode.SCENE2D as SceneMode,
      morphComplete: new Event(),
      globe: { tileLoadProgressEvent: new Event() },
    },
    imageryLayers: new ImageryLayerCollection(),
    isDestroyed: () => view.destroyed,
  };
  const [day, night] = createBaseLayers();
  viewer.imageryLayers.add(day);
  viewer.imageryLayers.add(night);
  /** Moves the camera to `zoom` and lets the hand-off see it. */
  const zoomTo = (zoom: number) => {
    view.zoom = zoom;
    viewer.camera.moveEnd.raiseEvent();
  };
  return { viewer, view, day, night, zoomTo };
}

/** A hand-off over a {@link fakeViewer}, counting the layers it makes. */
function setUp(source: DetailSource = 'osm') {
  const fake = fakeViewer();
  const made: ImageryLayer[] = [];
  const onShown = vi.fn();
  const handOff = new BasemapHandOff(fake.viewer as unknown as HandOffViewer, {
    source,
    above: fake.night,
    createLayer: (detail) => {
      const layer = createDetailLayer(detail);
      made.push(layer);
      return layer;
    },
    onShown,
    zoomOf: () => fake.view.zoom,
  });
  return { ...fake, made, onShown, handOff };
}

afterEach(() => vi.useRealTimers());

describe('BasemapHandOff', () => {
  it('draws only the NASA overview at world zoom, and asks no detailed tiles', () => {
    const { viewer, made, onShown, handOff } = setUp();
    expect(viewer.imageryLayers.length).toBe(2);
    expect(made).toHaveLength(0);
    expect(handOff.shownSource).toBeUndefined();
    expect(onShown).not.toHaveBeenCalled();
  });

  it('hands off to the detailed source past the overview zoom, over the night lights', () => {
    const { viewer, night, made, onShown, handOff, zoomTo } = setUp();
    // A product overlay already on top stays on top.
    const product = createDetailLayer('esri');
    viewer.imageryLayers.add(product);
    zoomTo(4.2);
    expect(made).toHaveLength(0);
    zoomTo(5);
    expect(made).toHaveLength(1);
    expect(viewer.imageryLayers.indexOf(made[0]!)).toBe(viewer.imageryLayers.indexOf(night) + 1);
    expect(viewer.imageryLayers.indexOf(product)).toBe(3);
    expect(made[0]!.show).toBe(true);
    expect(handOff.shownSource).toBe('osm');
    expect(onShown).toHaveBeenLastCalledWith('osm');
  });

  it('keeps the overview under the detailed layer and hides the layer when zoomed back out', () => {
    const { viewer, day, night, made, onShown, zoomTo } = setUp();
    zoomTo(6);
    expect(day.show && night.show).toBe(true);
    // In the dead band nothing changes.
    zoomTo(4.2);
    expect(made[0]!.show).toBe(true);
    zoomTo(3);
    expect(made[0]!.show).toBe(false);
    expect(viewer.imageryLayers.contains(made[0]!)).toBe(true);
    expect(day.show && night.show).toBe(true);
    expect(onShown).toHaveBeenLastCalledWith(undefined);
    // Back in, the same layer shows again: nothing new to make.
    zoomTo(8);
    expect(made).toHaveLength(1);
    expect(made[0]!.show).toBe(true);
  });

  it('switches only at the crossing, not on every camera event', () => {
    const { viewer, onShown, zoomTo } = setUp();
    zoomTo(6);
    for (let i = 0; i < 20; i++) viewer.camera.changed.raiseEvent();
    zoomTo(7);
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('keeps the old source under the new one until the globe has loaded, so it does not blink', () => {
    const { viewer, made, onShown, handOff, zoomTo } = setUp('osm');
    zoomTo(10);
    const [osm] = made;
    handOff.setSource('esri');
    const esri = made[1]!;
    expect(viewer.imageryLayers.indexOf(esri)).toBe(viewer.imageryLayers.indexOf(osm!) + 1);
    expect(osm!.show && esri.show).toBe(true);
    expect(onShown).toHaveBeenLastCalledWith('esri');
    viewer.scene.globe.tileLoadProgressEvent.raiseEvent(12);
    expect(viewer.imageryLayers.contains(osm!)).toBe(true);
    viewer.scene.globe.tileLoadProgressEvent.raiseEvent(0);
    expect(viewer.imageryLayers.contains(osm!)).toBe(false);
    expect(osm!.isDestroyed()).toBe(true);
    expect(viewer.imageryLayers.contains(esri)).toBe(true);
    expect(viewer.scene.globe.tileLoadProgressEvent.numberOfListeners).toBe(0);
  });

  it('lets the old source go after the timeout if the new one never finishes', () => {
    vi.useFakeTimers();
    const { viewer, made, handOff, zoomTo } = setUp('osm');
    zoomTo(10);
    handOff.setSource('esri');
    vi.advanceTimersByTime(SWAP_TIMEOUT_MS - 1);
    expect(viewer.imageryLayers.contains(made[0]!)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(viewer.imageryLayers.contains(made[0]!)).toBe(false);
  });

  it('changes source at once while only the overview shows', () => {
    const { viewer, made, onShown, handOff, zoomTo } = setUp('osm');
    zoomTo(10);
    zoomTo(2);
    handOff.setSource('esri');
    expect(viewer.imageryLayers.contains(made[0]!)).toBe(false);
    expect(made).toHaveLength(1);
    expect(onShown).toHaveBeenLastCalledWith(undefined);
    zoomTo(10);
    expect(made).toHaveLength(2);
    expect(onShown).toHaveBeenLastCalledWith('esri');
  });

  it('waits out a 2D/3D morph, then reads the zoom', () => {
    const { viewer, made, zoomTo } = setUp();
    viewer.scene.mode = SceneMode.MORPHING;
    zoomTo(10);
    expect(made).toHaveLength(0);
    viewer.scene.mode = SceneMode.SCENE3D;
    viewer.scene.morphComplete.raiseEvent();
    expect(made).toHaveLength(1);
  });

  it('removes its layers and stops following the camera when destroyed', () => {
    const { viewer, day, night, made, handOff, zoomTo } = setUp('osm');
    zoomTo(10);
    handOff.setSource('esri');
    handOff.destroy();
    expect(made.every((layer) => !viewer.imageryLayers.contains(layer))).toBe(true);
    expect(viewer.imageryLayers.contains(day) && viewer.imageryLayers.contains(night)).toBe(true);
    expect(viewer.camera.changed.numberOfListeners).toBe(0);
    expect(viewer.camera.moveEnd.numberOfListeners).toBe(0);
    expect(viewer.scene.morphComplete.numberOfListeners).toBe(0);
    expect(viewer.scene.globe.tileLoadProgressEvent.numberOfListeners).toBe(0);
  });
});
