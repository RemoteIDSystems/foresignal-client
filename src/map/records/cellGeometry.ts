import {
  ArcType,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  PolylineColorAppearance,
  PolylineGeometry,
} from 'cesium';
import type { AggregationStyle } from '../style/model';
import { rampColor, type HexCell } from './hexCells';
import { ringBox, type Pickable, type RecordPickId } from './recordPicking';

/** A cell drawn: its fill and outline instances, and how picking finds it. */
export interface CellDrawing {
  fill: GeometryInstance;
  outline: GeometryInstance;
  pickable: Pickable;
  /** The cell's extent, `[west, south, east, north]`, so picking tests only the cells near. */
  box: [number, number, number, number];
}

/**
 * One aggregate cell as the map draws it, whoever counted it (the backend's `agg=hex` tiles or
 * the client's clusters, 037): filled by its count on the aggregation ramp, at the style's
 * opacity, with a one-pixel outline in the style's outline color. Cells are ordinary primitives at
 * the ellipsoid, not ground primitives (see `RecordLayer`).
 */
export function drawCell(
  cell: HexCell,
  style: Pick<AggregationStyle, 'ramp' | 'opacity' | 'outlineColor'>,
  id: RecordPickId,
): CellDrawing {
  const opacity = style.opacity ?? 0.6;
  const fill = Color.fromCssColorString(rampColor(style.ramp, cell.count)).withAlpha(opacity);
  const outline = Color.fromCssColorString(style.outlineColor ?? '#FFFFFF').withAlpha(opacity);
  return {
    fill: cellFill(cell, fill, id),
    outline: cellOutline(cell, outline, id),
    pickable: { id, shape: { type: 'cell', ring: cell.ring } },
    box: ringBox(cell.ring),
  };
}

/** One cell's fill, on the ellipsoid. */
function cellFill(cell: HexCell, color: Color, id: RecordPickId): GeometryInstance {
  return new GeometryInstance({
    geometry: new PolygonGeometry({
      polygonHierarchy: new PolygonHierarchy(positions(cell.ring)),
      arcType: ArcType.RHUMB,
      vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
    }),
    attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
    id,
  });
}

/** One cell's outline, on the ellipsoid, one pixel wide. */
function cellOutline(cell: HexCell, color: Color, id: RecordPickId): GeometryInstance {
  return new GeometryInstance({
    geometry: new PolylineGeometry({
      positions: positions(cell.ring),
      width: 1,
      arcType: ArcType.RHUMB,
      vertexFormat: PolylineColorAppearance.VERTEX_FORMAT,
    }),
    attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
    id,
  });
}

/** Degrees to Cartesian positions on the ellipsoid. */
export function positions(coordinates: [number, number][]): Cartesian3[] {
  return Cartesian3.fromDegreesArray(coordinates.flat());
}

/** True when a cell's box may hold the point: its latitudes, and its longitudes unless it wraps. */
export function boxMayHold(
  box: readonly [number, number, number, number],
  longitude: number,
  latitude: number,
): boolean {
  const [west, south, east, north] = box;
  if (latitude < south || latitude > north) return false;
  return east - west >= 180 || (longitude >= west && longitude <= east);
}
