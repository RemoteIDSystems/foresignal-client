import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import type { ForesignalClient } from '../../api/client';
import type { OverlayStyle } from '../style/loadOverlayStyle';
import { RecordLayerSet } from './recordLayerSet';
import type { RecordLayerStatus } from './recordLayers';

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
}

/**
 * Lives inside the Resium viewer and keeps a {@link RecordLayerSet} in step with the enabled
 * layers, the hidden sources and the overlay style. Renders nothing itself: the records are Cesium primitives.
 */
export function RecordLayersBridge({
  api,
  overlay,
  layers,
  hiddenSources,
  onStatus,
}: RecordLayersBridgeProps) {
  const { viewer } = useCesium();
  const setRef = useRef<RecordLayerSet>(undefined);
  const latest = useRef({ overlay, layers, hiddenSources });

  // Declared first so it runs first: on the first render the set does not exist yet and picks
  // these up when it is created below.
  useEffect(() => {
    latest.current = { overlay, layers, hiddenSources };
    setRef.current?.setStyle(overlay);
    setRef.current?.setHiddenSources(hiddenSources);
    setRef.current?.setLayers(layers);
  }, [overlay, layers, hiddenSources]);

  useEffect(() => {
    if (!viewer) return;
    const set = new RecordLayerSet(viewer, api, onStatus);
    set.setStyle(latest.current.overlay);
    set.setHiddenSources(latest.current.hiddenSources);
    set.setLayers(latest.current.layers);
    setRef.current = set;
    return () => {
      set.destroy();
      setRef.current = undefined;
    };
  }, [viewer, api, onStatus]);

  return null;
}
