import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import type { ImageryLayer } from 'cesium';
import { BasemapHandOff } from './basemapHandOff';
import {
  cartoKey,
  createDetailLayer,
  describeShown,
  detailSourceFor,
  type BasemapStyle,
  type DetailSource,
  type ShownBasemap,
} from './basemapStyle';
import { createBaseLayers } from './imagery';

/** Props for {@link Basemap}. */
export interface BasemapProps {
  /** The basemap picked: its detailed source is drawn past the hand-off zoom. */
  style: BasemapStyle;
  /**
   * Told the detailed basemap drawn now (its source, credit and deepest level), or undefined while
   * only the NASA overview is; told again once its layer is ready, with the provider's own credit
   * and deepest level (Esri's from its service).
   */
  onShown?: (shown: ShownBasemap | undefined) => void;
}

/**
 * Lives inside the Resium viewer and draws the basemap (038): the self-hosted NASA Blue Marble /
 * Black Marble day/night overview at every zoom, handed off past the overview zoom to the picked
 * style's detailed tiles ({@link BasemapHandOff}): OpenStreetMap, or CARTO with `VITE_CARTO_KEY`,
 * for the map, Esri World Imagery for satellite. Changing style swaps the detailed tiles without a
 * blink. Renders nothing.
 */
export function Basemap({ style, onShown }: BasemapProps) {
  const { viewer } = useCesium();
  const source = detailSourceFor(style, cartoKey());
  const sourceRef = useRef(source);
  const shownRef = useRef(onShown);
  const handOff = useRef<BasemapHandOff>(undefined);
  useEffect(() => {
    shownRef.current = onShown;
  }, [onShown]);
  useEffect(() => {
    if (!viewer) return;
    // Base layers per viewer instance: destroying a viewer destroys its layers.
    const [day, night] = createBaseLayers();
    viewer.imageryLayers.add(day, 0);
    viewer.imageryLayers.add(night, 1);
    const options = { key: cartoKey(), pixelRatio: window.devicePixelRatio };
    // Stops waiting for the last shown layer to be ready.
    let stopReady: (() => void) | undefined;
    const report = (detail: DetailSource | undefined, layer: ImageryLayer | undefined) => {
      stopReady?.();
      stopReady = undefined;
      shownRef.current?.(detail && describeShown(detail, layer));
      if (!detail || !layer || layer.ready) return;
      const stop = layer.readyEvent.addEventListener(() => {
        stop();
        if (stopReady !== stop) return;
        stopReady = undefined;
        shownRef.current?.(describeShown(detail, layer));
      });
      stopReady = stop;
    };
    const current = new BasemapHandOff(viewer, {
      source: sourceRef.current,
      above: night,
      createLayer: (detail) => createDetailLayer(detail, options),
      onShown: report,
    });
    handOff.current = current;
    return () => {
      stopReady?.();
      current.destroy();
      handOff.current = undefined;
      if (!viewer.isDestroyed()) {
        viewer.imageryLayers.remove(night, true);
        viewer.imageryLayers.remove(day, true);
      }
    };
  }, [viewer]);
  useEffect(() => {
    sourceRef.current = source;
    handOff.current?.setSource(source);
  }, [source]);
  return null;
}
