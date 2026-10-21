import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import {
  Cartesian2,
  Cartesian3,
  Color,
  EllipsoidalOccluder,
  HorizontalOrigin,
  JulianDate,
  LabelCollection,
  LabelStyle,
  Material,
  PointPrimitive,
  PointPrimitiveCollection,
  PolylineCollection,
  SceneMode,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  type Label,
  type Polyline,
  type Viewer,
} from 'cesium';
import { MAX_LABELS, MAX_RINGS, type Satellite } from './constellation';
import { groundTrack, orbitRing, periodMinutes, positionAt } from './orbit';
import { registerSatellites } from './satelliteProbe';

/** Props for {@link ConstellationLayer}. */
export interface ConstellationLayerProps {
  satellites: readonly Satellite[];
  /** Each source's color, by its key. */
  colors: Readonly<Record<string, string>>;
  /** The selected satellite's catalog number. */
  selected?: number;
  /** Told the catalog number of a satellite clicked, or undefined for a click on nothing. */
  onSelect: (norad: number | undefined) => void;
  /** The scrubber: hours from now the clock is set to; a new value moves the clock there. */
  offsetHours: number;
  /** Told the clock's instant about once a second, for the scrubber's readout. */
  onTime?: (at: Date) => void;
}

/** How often the satellites are moved, in wall-clock milliseconds. */
const MOVE_EVERY_MS = 100;

/** How far the clock moves, in seconds, before the orbit rings and the ground track are redrawn. */
const REDRAW_AFTER_S = 60;

/** Sets the scene's clock to `offsetHours` from now, running in real time from there. */
function setClock(viewer: Viewer, offsetHours: number): void {
  const { clock } = viewer;
  clock.currentTime = JulianDate.addSeconds(JulianDate.now(), offsetHours * 3600, new JulianDate());
  clock.multiplier = 1;
  clock.shouldAnimate = true;
}

/** A satellite's drawn point and label. */
interface Drawn {
  satellite: Satellite;
  point: PointPrimitive;
  label?: Label;
}

/**
 * The constellation on the globe (027), rendered inside the viewer: each satellite a point colored
 * by its source, labeled (the first {@link MAX_LABELS}), on its orbit ring (up to
 * {@link MAX_RINGS}), moved by SGP4 to the Cesium clock's instant as the clock runs. The globe's
 * depth hides points and rings behind the Earth. The selected satellite is larger, labeled, and
 * draws its ground track an orbit before and after. A click picks a satellite. The clock is set to
 * `offsetHours` from now whenever that changes, and keeps running from there.
 */
export function ConstellationLayer({
  satellites,
  colors,
  selected,
  onSelect,
  offsetHours,
  onTime,
}: ConstellationLayerProps) {
  const { viewer } = useCesium();
  const selectListener = useRef(onSelect);
  const timeListener = useRef(onTime);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectListener.current = onSelect;
    timeListener.current = onTime;
  }, [onSelect, onTime]);

  // The scrubber moves the clock; it runs in real time from there.
  useEffect(() => {
    if (viewer) setClock(viewer, offsetHours);
  }, [viewer, offsetHours]);

  // The satellites, their rings and the selected one's ground track.
  useEffect(() => {
    if (!viewer) return;
    const { scene } = viewer;
    const points = scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection;
    const labels = scene.primitives.add(new LabelCollection()) as LabelCollection;
    const rings = scene.primitives.add(new PolylineCollection()) as PolylineCollection;
    const tracks = scene.primitives.add(new PolylineCollection()) as PolylineCollection;
    const drawn = new Map<number, Drawn>();
    const ringLines = new Map<number, Polyline>();
    const scratch = new Cartesian3();

    satellites.forEach((satellite, index) => {
      const color = Color.fromCssColorString(colors[satellite.source] ?? '#a3b0bf');
      const point = points.add({
        id: satellite.norad,
        position: Cartesian3.ZERO,
        pixelSize: 6,
        color,
        outlineColor: Color.BLACK.withAlpha(0.6),
        outlineWidth: 1,
      });
      const label =
        index < MAX_LABELS
          ? labels.add({
              position: Cartesian3.ZERO,
              text: satellite.name,
              font: '11px sans-serif',
              fillColor: Color.WHITE.withAlpha(0.85),
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cartesian2(8, 0),
              horizontalOrigin: HorizontalOrigin.LEFT,
              verticalOrigin: VerticalOrigin.CENTER,
            })
          : undefined;
      drawn.set(satellite.norad, { satellite, point, ...(label && { label }) });
    });

    let lastMove = 0;
    let lastRedraw: JulianDate | undefined;
    let lastTold = 0;
    let lastSelected: number | undefined;

    /** Moves every satellite to an instant. */
    const move = (at: Date) => {
      for (const entry of drawn.values()) {
        const position = positionAt(entry.satellite.satrec, at);
        entry.point.show = position !== undefined;
        if (entry.label) entry.label.show = position !== undefined;
        if (!position) continue;
        Cartesian3.fromElements(position.ecf.x, position.ecf.y, position.ecf.z, scratch);
        entry.point.position = scratch;
        if (entry.label) entry.label.position = scratch;
      }
    };

    /** Redraws the rings and the selected satellite's ground track for an instant. */
    const redraw = (at: Date) => {
      rings.removeAll();
      ringLines.clear();
      const ringed = satellites.length <= MAX_RINGS ? satellites : [];
      for (const satellite of ringed) {
        const positions = orbitRing(satellite.satrec, satellite.element, at, 72).map(
          (point) => new Cartesian3(point.x, point.y, point.z),
        );
        if (positions.length < 2) continue;
        const color = Color.fromCssColorString(colors[satellite.source] ?? '#a3b0bf');
        ringLines.set(
          satellite.norad,
          rings.add({
            positions,
            width: 1,
            material: Material.fromType('Color', { color: color.withAlpha(0.3) }),
          }),
        );
      }
      tracks.removeAll();
      const chosen = selectedRef.current !== undefined ? drawn.get(selectedRef.current) : undefined;
      if (chosen) {
        const period = periodMinutes(chosen.satellite.element);
        const color = Color.fromCssColorString(colors[chosen.satellite.source] ?? '#a3b0bf');
        for (const segment of groundTrack(chosen.satellite.satrec, at, period, period, 1)) {
          tracks.add({
            positions: Cartesian3.fromDegreesArray(
              segment.flatMap((point) => [point.longitude, point.latitude]),
            ),
            width: 2,
            material: Material.fromType('Color', { color: color.withAlpha(0.8) }),
          });
        }
        const ring = ringLines.get(chosen.satellite.norad);
        if (ring) {
          ring.width = 2;
          ring.material = Material.fromType('Color', { color: color.withAlpha(0.9) });
        }
      }
    };

    /** Marks the selected satellite: larger, outlined and always labeled. */
    const mark = () => {
      for (const entry of drawn.values()) {
        const chosen = entry.satellite.norad === selectedRef.current;
        entry.point.pixelSize = chosen ? 11 : 6;
        entry.point.outlineColor = chosen ? Color.WHITE : Color.BLACK.withAlpha(0.6);
        entry.point.outlineWidth = chosen ? 2 : 1;
      }
    };

    const onPreRender = () => {
      const now = performance.now();
      const at = JulianDate.toDate(viewer.clock.currentTime);
      if (now - lastMove >= MOVE_EVERY_MS) {
        lastMove = now;
        move(at);
      }
      const moved =
        !lastRedraw ||
        Math.abs(JulianDate.secondsDifference(viewer.clock.currentTime, lastRedraw)) >=
          REDRAW_AFTER_S;
      if (moved || selectedRef.current !== lastSelected) {
        lastRedraw = JulianDate.clone(viewer.clock.currentTime);
        lastSelected = selectedRef.current;
        mark();
        redraw(at);
      }
      if (now - lastTold >= 1000) {
        lastTold = now;
        timeListener.current?.(at);
      }
    };
    const removePreRender = scene.preRender.addEventListener(onPreRender);

    const handler = new ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = scene.pick(click.position) as
        { primitive?: unknown; id?: unknown } | undefined;
      selectListener.current(
        picked?.primitive instanceof PointPrimitive && typeof picked.id === 'number'
          ? picked.id
          : undefined,
      );
    }, ScreenSpaceEventType.LEFT_CLICK);

    if (import.meta.env.DEV) {
      registerSatellites({
        count: satellites.length,
        screenOf: (norad) => {
          const entry = drawn.get(norad);
          if (!entry?.point.show) return undefined;
          // On the globe, one behind the Earth is not on screen, though it projects onto it.
          if (
            scene.mode === SceneMode.SCENE3D &&
            !new EllipsoidalOccluder(scene.globe.ellipsoid, scene.camera.positionWC).isPointVisible(
              entry.point.position,
            )
          ) {
            return undefined;
          }
          const at = SceneTransforms.worldToWindowCoordinates(scene, entry.point.position);
          return at && { x: at.x, y: at.y };
        },
        view: (norad) => {
          const entry = drawn.get(norad);
          if (!entry?.point.show) return false;
          viewer.camera.setView({
            destination: Cartesian3.multiplyByScalar(entry.point.position, 3, new Cartesian3()),
          });
          scene.requestRender();
          return true;
        },
      });
    }
    move(JulianDate.toDate(viewer.clock.currentTime));
    scene.requestRender();

    return () => {
      if (import.meta.env.DEV) registerSatellites(undefined);
      removePreRender();
      handler.destroy();
      if (viewer.isDestroyed()) return;
      for (const collection of [points, labels, rings, tracks]) scene.primitives.remove(collection);
      scene.requestRender();
    };
  }, [viewer, satellites, colors]);

  // The selection is read each frame, so a new one needs no rebuild.
  useEffect(() => {
    selectedRef.current = selected;
    viewer?.scene.requestRender();
  }, [viewer, selected]);

  return null;
}
