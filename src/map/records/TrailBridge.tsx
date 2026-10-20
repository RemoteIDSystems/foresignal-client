import {
  ArcType,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  PolylineColorAppearance,
} from 'cesium';
import { useEffect } from 'react';
import { useCesium } from 'resium';
import type { ForesignalClient } from '../../api/client';
import type { TimeCursor } from '../../state/store';
import { loadTrack } from '../../time/timeApi';
import { TRAIL_WINDOW_MS, trailOf, type Trail } from '../../time/trail';
import type { RecordHit } from './recordPicking';

/** Width of a trail, in pixels. */
const TRAIL_WIDTH = 4;

/** Props for {@link TrailBridge}. */
export interface TrailBridgeProps {
  api: ForesignalClient;
  /** The selected record, whose trail is drawn. */
  selected: RecordHit | undefined;
  /** The time cursor: the trail ends at its instant (now while live). */
  time: TimeCursor;
  /** The trail's color, a CSS color. */
  color: string;
  /** Told what the trail shows, or undefined when none is drawn. */
  onTrail?: (trail: Trail | undefined) => void;
}

/**
 * Lives inside the Resium viewer and draws the selected entity's trail (013): where it was over the
 * {@link TRAIL_WINDOW_MS} before the time cursor, from `getRecordTrack`, as a ground polyline in the
 * accent color under the selection marker. Selecting another record, or moving the cursor, loads
 * its trail afresh; clearing the selection removes it. Records with no source and id (a hexagon
 * cell) have no trail.
 */
export function TrailBridge({ api, selected, time, color, onTrail }: TrailBridgeProps) {
  const { viewer } = useCesium();
  const source = selected?.id.source;
  const externalId = selected?.id.externalId;
  const asOf = time.mode === 'asOf' ? time.asOf : undefined;

  useEffect(() => {
    if (!viewer || !source || !externalId) {
      onTrail?.(undefined);
      return;
    }
    const controller = new AbortController();
    const ground = viewer.scene.groundPrimitives;
    let primitive: GroundPolylinePrimitive | undefined;
    const to = asOf !== undefined ? Date.parse(asOf) : Date.now();
    loadTrack(api, source, externalId, { from: to - TRAIL_WINDOW_MS, to }, controller.signal)
      .then((track) => {
        if (controller.signal.aborted || viewer.isDestroyed()) return;
        const trail = trailOf(track);
        onTrail?.(trail);
        if (trail.lines.length === 0) return;
        const lineColor = ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(color));
        primitive = ground.add(
          new GroundPolylinePrimitive({
            geometryInstances: trail.lines.map(
              (line) =>
                new GeometryInstance({
                  geometry: new GroundPolylineGeometry({
                    positions: Cartesian3.fromDegreesArray(line.flat()),
                    width: TRAIL_WIDTH,
                    arcType: ArcType.GEODESIC,
                  }),
                  attributes: { color: lineColor },
                }),
            ),
            appearance: new PolylineColorAppearance(),
          }),
        ) as GroundPolylinePrimitive;
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('ForeSignal: the trail did not load.', cause);
        onTrail?.(undefined);
      });
    return () => {
      controller.abort();
      if (primitive && !viewer.isDestroyed()) ground.remove(primitive);
    };
  }, [viewer, api, source, externalId, asOf, color, onTrail]);

  return null;
}
