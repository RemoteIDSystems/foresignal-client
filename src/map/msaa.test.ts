import { Event, SceneMode } from 'cesium';
import { adaptMsaa, type MsaaViewer } from './adaptMsaa';
import {
  DETAIL_FROM_ZOOM,
  DETAIL_MSAA,
  msaaForZoom,
  OVERVIEW_BELOW_ZOOM,
  OVERVIEW_MSAA,
} from './msaa';

/** A viewer stand-in whose camera events are raised by hand, counting writes to the samples. */
function fakeViewer() {
  let samples = DETAIL_MSAA;
  const writes: number[] = [];
  const viewer = {
    camera: { changed: new Event(), moveEnd: new Event() },
    scene: {
      mode: SceneMode.SCENE2D,
      morphComplete: new Event(),
      get msaaSamples() {
        return samples;
      },
      set msaaSamples(value: number) {
        samples = value;
        writes.push(value);
      },
    },
    isDestroyed: () => false,
  };
  return { viewer: viewer as unknown as MsaaViewer, raw: viewer, writes };
}

describe('adaptive MSAA', () => {
  it('draws the overview without MSAA and a closer view with the shipped 4×', () => {
    expect(msaaForZoom(1.7, DETAIL_MSAA)).toBe(OVERVIEW_MSAA);
    expect(msaaForZoom(OVERVIEW_BELOW_ZOOM, OVERVIEW_MSAA)).toBe(OVERVIEW_MSAA);
    expect(msaaForZoom(DETAIL_FROM_ZOOM, OVERVIEW_MSAA)).toBe(DETAIL_MSAA);
    expect(msaaForZoom(12, DETAIL_MSAA)).toBe(DETAIL_MSAA);
  });

  it('keeps what it has between the two zooms, so it does not switch back and forth', () => {
    const between = (OVERVIEW_BELOW_ZOOM + DETAIL_FROM_ZOOM) / 2;
    expect(msaaForZoom(between, OVERVIEW_MSAA)).toBe(OVERVIEW_MSAA);
    expect(msaaForZoom(between, DETAIL_MSAA)).toBe(DETAIL_MSAA);
  });

  it('writes the samples only at a crossing, on camera events, and restores 4× when stopped', () => {
    const { viewer, raw, writes } = fakeViewer();
    let zoom = 1.7;
    const stop = adaptMsaa(viewer, () => zoom);
    expect(writes).toEqual([OVERVIEW_MSAA]);
    raw.camera.changed.raiseEvent();
    raw.camera.moveEnd.raiseEvent();
    expect(writes).toEqual([OVERVIEW_MSAA]);
    zoom = 8;
    raw.camera.changed.raiseEvent();
    raw.camera.moveEnd.raiseEvent();
    expect(writes).toEqual([OVERVIEW_MSAA, DETAIL_MSAA]);
    zoom = 2;
    raw.scene.morphComplete.raiseEvent();
    expect(writes).toEqual([OVERVIEW_MSAA, DETAIL_MSAA, OVERVIEW_MSAA]);
    stop();
    expect(raw.scene.msaaSamples).toBe(DETAIL_MSAA);
    zoom = 1;
    raw.camera.changed.raiseEvent();
    expect(raw.scene.msaaSamples).toBe(DETAIL_MSAA);
  });

  it('leaves the samples alone mid-morph', () => {
    const { viewer, raw, writes } = fakeViewer();
    raw.scene.mode = SceneMode.MORPHING;
    adaptMsaa(viewer, () => 1);
    expect(writes).toEqual([]);
  });
});
