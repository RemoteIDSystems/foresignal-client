import { Cartesian3, SceneTransforms } from 'cesium';
import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import type { ForesignalClient } from '../../api/client';
import type { ChangeStream } from '../../api/stream/ChangeStream';
import { registerEngine } from '../stress/engineProbe';
import type { OverlayStyle } from '../style/loadOverlayStyle';
import type { RecordFeature } from './decodeTile';
import { changedArea, liveArea, type ChangedArea, type LiveAreaSource } from './liveChanges';
import { MapPointer } from './mapPointer';
import { RecordLayerSet } from './recordLayerSet';
import type { RecordLayerStatus } from './recordLayers';
import type { RecordHit } from './recordPicking';
import type { RecordGrouping } from './recordGrouping';

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
  /** The live stream: the tiles its changes touch are fetched again and redrawn (011). */
  stream?: ChangeStream;
  /** Another live source of changed areas: a saved view's own stream (031). */
  liveAreas?: LiveAreaSource;
  /** The instant the layers are pinned at (013), to the second; undefined for live data. */
  asOf?: string;
  /** A history playback's step, drawn in place of the tiles while one is shown (013). */
  frame?: readonly RecordFeature[];
  /** Hexagon cells zoomed out, or every record on its own; hexagons by default. */
  grouping?: RecordGrouping;
}

/**
 * Lives inside the Resium viewer and keeps a {@link RecordLayerSet} in step with the enabled
 * layers, the hidden sources and the overlay style, and runs the map's pointer ({@link MapPointer}),
 * which picks the set's records on hover and click. With the live stream, the tiles a change or
 * live position touches are fetched again ({@link RecordLayerSet.applyAreas}), and a resync loads
 * every drawn tile again; a saved view's own stream (`liveAreas`, 031) does the same for its
 * layer. Pinned at an instant (013), the layers draw that instant's tiles and the
 * stream's changes wait; a history playback's step is drawn in their place. Renders nothing itself: the records are Cesium primitives. In development
 * it registers the engine for the stress harness and the end-to-end checks.
 */
export function RecordLayersBridge({
  api,
  overlay,
  layers,
  hiddenSources,
  onStatus,
  onHover,
  onSelect,
  stream,
  liveAreas,
  asOf,
  frame,
  grouping = 'hexagons',
}: RecordLayersBridgeProps) {
  const { viewer } = useCesium();
  const setRef = useRef<RecordLayerSet>(undefined);
  const latest = useRef({ overlay, layers, hiddenSources, asOf, frame, grouping });
  const pointerHandlers = useRef({ onHover, onSelect });
  const streamRef = useRef(stream);

  // Declared first so it runs first: on the first render the set does not exist yet and picks
  // these up when it is created below.
  useEffect(() => {
    latest.current = { overlay, layers, hiddenSources, asOf, frame, grouping };
    setRef.current?.setGrouping(grouping);
    setRef.current?.setStyle(overlay);
    setRef.current?.setHiddenSources(hiddenSources);
    setRef.current?.setAsOf(asOf);
    setRef.current?.setLayers(layers);
    setRef.current?.setFrame(frame);
  }, [overlay, layers, hiddenSources, asOf, frame, grouping]);

  useEffect(() => {
    pointerHandlers.current = { onHover, onSelect };
  }, [onHover, onSelect]);

  useEffect(() => {
    streamRef.current = stream;
    if (!stream) return;
    return stream.listen({
      changes(changes) {
        const areas = changes.map(changedArea).filter((area): area is ChangedArea => !!area);
        if (areas.length > 0) setRef.current?.applyAreas(areas);
      },
      live(event) {
        const area = liveArea(event);
        if (area) setRef.current?.applyAreas([area]);
      },
      resync() {
        setRef.current?.reload();
      },
    });
  }, [stream]);

  useEffect(
    () =>
      liveAreas?.listen({
        areas: (areas) => setRef.current?.applyAreas(areas),
        reload: () => setRef.current?.reload(),
      }),
    [liveAreas],
  );

  useEffect(() => {
    if (!viewer) return;
    const set = new RecordLayerSet(viewer, api, onStatus);
    set.setGrouping(latest.current.grouping);
    set.setStyle(latest.current.overlay);
    set.setHiddenSources(latest.current.hiddenSources);
    set.setAsOf(latest.current.asOf);
    set.setLayers(latest.current.layers);
    set.setFrame(latest.current.frame);
    setRef.current = set;
    const pointer = new MapPointer(viewer, () => setRef.current, {
      onHover: (hit) => pointerHandlers.current.onHover?.(hit),
      onSelect: (hit) => pointerHandlers.current.onSelect?.(hit),
    });
    if (import.meta.env.DEV) {
      registerEngine({
        viewer,
        layers: set,
        stream: streamRef.current,
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
