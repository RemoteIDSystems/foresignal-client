import { SceneMode, type Viewer } from 'cesium';
import { DETAIL_MSAA, msaaForZoom } from './msaa';
import { readRecordView } from './records/recordLayers';

/** The parts of a Cesium viewer {@link adaptMsaa} uses. */
export interface MsaaViewer {
  camera: Pick<Viewer['camera'], 'changed' | 'moveEnd'>;
  scene: Pick<Viewer['scene'], 'msaaSamples' | 'mode' | 'morphComplete'>;
  isDestroyed(): boolean;
}

/**
 * Draws the viewer's scene with MSAA by zoom ({@link msaaForZoom}): set at once, then again only
 * when the camera has moved (its `changed` and `moveEnd` events, and after a 2D/3D switch), and
 * written to the scene only when the samples change, so the framebuffers are rebuilt at the
 * crossing and not every frame. Returns the function that stops it and restores
 * {@link DETAIL_MSAA}.
 *
 * @param zoomOf The view's map zoom; {@link readRecordView}'s by default.
 */
export function adaptMsaa(
  viewer: MsaaViewer,
  zoomOf: () => number = () => readRecordView(viewer as Viewer).zoom,
): () => void {
  const { camera, scene } = viewer;
  const apply = () => {
    if (viewer.isDestroyed() || scene.mode === SceneMode.MORPHING) return;
    const samples = msaaForZoom(zoomOf(), scene.msaaSamples);
    if (samples !== scene.msaaSamples) scene.msaaSamples = samples;
  };
  const removers = [
    camera.changed.addEventListener(apply),
    camera.moveEnd.addEventListener(apply),
    scene.morphComplete.addEventListener(apply),
  ];
  apply();
  return () => {
    removers.forEach((remove) => remove());
    if (!viewer.isDestroyed()) scene.msaaSamples = DETAIL_MSAA;
  };
}
