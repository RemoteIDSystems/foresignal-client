import { Cartesian3, SceneTransforms } from 'cesium';
import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import type { ForesignalClient } from '../../api/client';
import { registerEngine } from '../stress/engineProbe';
import type { OverlayStyle } from '../style/loadOverlayStyle';
import { MapPointer } from './mapPointer';
import { RecordLayerSet } from './recordLayerSet';
import type { RecordLayerStatus } from './recordLayers';
import type { RecordHit } from './recordPicking';

/** Props for {@link RecordLayersBridge}. */
export interface RecordLayersBridgeProps {
  api: ForesignalClient;
  /** The overlay style the records are drawn with; nothing is drawn until it loads. */
  overlay: OverlayStyle | undefined;
  /** The enabled layer ids. */
  layers: readonly string[];
  /** Sources whose records are hidden (the FILTERS tab). */
  hiddenSources: ReadonlySet<string>;
  /** Told when a layer's status changes. */
  onStatus: (id: string, status: RecordLayerStatus) => void;
  /** The record under the pointer as it moves, or undefined. */
  onHover?: (hit: RecordHit | undefined) => void;
  /** The record clicked, or undefined for a click on nothing. */
  onSelect?: (hit: RecordHit | undefined) => void;
}

/**
 * Lives inside the Resium viewer and keeps a {@link RecordLayerSet} in step with the enabled
 * layers, the hidden sources and the overlay style, and runs the map's pointer ({@link MapPointer}),
 * which picks the set's records on hover and click. Renders nothing itself: the records are Cesium
 * primitives. In development it registers the engine for the stress harness.
 */
export function RecordLayersBridge({
  api,
  overlay,
  layers,
  hiddenSources,
  onStatus,
  onHover,
  onSelect,
}: RecordLayersBridgeProps) {
  const { viewer } = useCesium();
  const setRef = useRef<RecordLayerSet>(undefined);
  const latest = useRef({ overlay, layers, hiddenSources });
  const pointerHandlers = useRef({ onHover, onSelect });

  // Declared first so it runs first: on the first render the set does not exist yet and picks
  // these up when it is created below.
  useEffect(() => {
    latest.current = { overlay, layers, hiddenSources };
    setRef.current?.setStyle(overlay);
    setRef.current?.setHiddenSources(hiddenSources);
    setRef.current?.setLayers(layers);
  }, [overlay, layers, hiddenSources]);

  useEffect(() => {
    pointerHandlers.current = { onHover, onSelect };
  }, [onHover, onSelect]);

  useEffect(() => {
    if (!viewer) return;
    const set = new RecordLayerSet(viewer, api, onStatus);
    set.setStyle(latest.current.overlay);
    set.setHiddenSources(latest.current.hiddenSources);
    set.setLayers(latest.current.layers);
    setRef.current = set;
    const pointer = new MapPointer(viewer, () => setRef.current, {
      onHover: (hit) => pointerHandlers.current.onHover?.(hit),
      onSelect: (hit) => pointerHandlers.current.onSelect?.(hit),
    });
    if (import.meta.env.DEV) {
      registerEngine({
        viewer,
        layers: set,
        toScreen: (longitude, latitude) => {
          const at = SceneTransforms.worldToWindowCoordinates(
            viewer.scene,
            Cartesian3.fromDegrees(longitude, latitude),
          );
          return at && { x: at.x, y: at.y };
        },
      });
    }
    return () => {
      if (import.meta.env.DEV) registerEngine(undefined);
      pointer.destroy();
      set.destroy();
      setRef.current = undefined;
    };
  }, [viewer, api, onStatus]);

  return null;
}
