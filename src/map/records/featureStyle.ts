import {
  colorFor,
  iconFor,
  sourceLayer,
  stylesForKind,
  valueAtZoom,
  type ColorRule,
  type KindStyle,
  type StyleModel,
} from '../style/model';
import type { PropertyValue, RecordGeometry } from './decodeTile';

/** How to draw a point record: a sprite icon or a circle. */
export type PointSymbol =
  | {
      type: 'icon';
      icon: string;
      color: string;
      haloColor?: string;
      haloWidth?: number;
      /** Heading in degrees clockwise from north, when the style rotates the icon by a field. */
      rotation?: number;
      /** Whether a rotated icon turns with the map or stays upright on screen. */
      rotationAlignment?: 'map' | 'viewport' | 'auto';
    }
  | {
      type: 'circle';
      /** Radius in CSS pixels. */
      radius: number;
      color: string;
      opacity: number;
      strokeColor?: string;
      strokeWidth?: number;
    };

/** How to draw a line, or a polygon's outline. */
export interface LineSymbol {
  color: string;
  /** Width in CSS pixels. */
  width: number;
}

/** How to fill a polygon. */
export interface FillSymbol {
  color: string;
  opacity: number;
}

/** What to draw for one record. */
export type RecordSymbol =
  | { type: 'point'; point: PointSymbol }
  | { type: 'line'; line: LineSymbol }
  | { type: 'polygon'; fill?: FillSymbol; outline?: LineSymbol };

/**
 * Drawn for a record the style has no entry for, so a new kind shows up rather than vanishing.
 * Neutral gray, smaller than styled points.
 */
export const UNSTYLED_COLOR = '#adb5bd';

/** Circle radius when the style sizes circles by data this client does not interpret yet. */
export const DEFAULT_CIRCLE_RADIUS = 5;

/**
 * The style that draws a record: the one for its own source and kind, else any source's style for
 * its kind. A record names its source and kind in its `source` and `kind` properties; a source
 * layer's tile may omit `kind` when the layer carries one kind. Undefined when the style knows
 * neither.
 */
export function styleForRecord(
  model: StyleModel,
  layerId: string,
  properties: Record<string, PropertyValue>,
): KindStyle | undefined {
  const source = typeof properties.source === 'string' ? properties.source : layerId;
  let kind = typeof properties.kind === 'string' ? properties.kind : undefined;
  if (kind === undefined) {
    const kinds = sourceLayer(model, source)?.kinds ?? [];
    kind = kinds.length === 1 ? kinds[0] : layerId;
  }
  const forKind = stylesForKind(model, kind ?? layerId);
  return forKind.find((style) => style.layerId === source) ?? forKind[0];
}

/**
 * Resolves what to draw for one record at a map zoom, from the overlay style: its point icon or
 * circle, its line, or its polygon fill and outline, with field-driven colors and rotation read
 * from the record's properties and zoom ramps read at `zoom`. Returns undefined when the style
 * hides the record at this zoom (its `minzoom`/`maxzoom`, or a geometry filter that excludes it).
 * A record with no style at all is drawn as a small gray circle or line.
 */
export function resolveSymbol(
  model: StyleModel,
  layerId: string,
  properties: Record<string, PropertyValue>,
  geometry: RecordGeometry['type'],
  zoom: number,
): RecordSymbol | undefined {
  const style = styleForRecord(model, layerId, properties);
  if (!style) return unstyled(geometry);
  if (geometry === 'point') {
    const point = style.point;
    if (!point || !accepts(point.filter.geometry, 'point') || !inZoom(point, zoom)) return;
    if (point.type === 'icon') {
      const symbol: PointSymbol = {
        type: 'icon',
        icon: iconFor(point, properties),
        color: color(point.color, properties),
        haloColor: point.haloColor,
        haloWidth: point.haloWidth,
      };
      const heading = point.rotateField ? Number(properties[point.rotateField]) : NaN;
      if (Number.isFinite(heading)) {
        symbol.rotation = heading;
        symbol.rotationAlignment = point.rotationAlignment ?? 'auto';
      }
      return { type: 'point', point: symbol };
    }
    return {
      type: 'point',
      point: {
        type: 'circle',
        radius:
          point.radius === undefined ? DEFAULT_CIRCLE_RADIUS : valueAtZoom(point.radius, zoom),
        color: color(point.color, properties),
        opacity: point.opacity ?? 1,
        strokeColor: point.strokeColor,
        strokeWidth: point.strokeWidth,
      },
    };
  }
  if (geometry === 'line') {
    const line = style.line;
    if (!line || !accepts(line.filter.geometry, 'line') || !inZoom(line, zoom)) return;
    return {
      type: 'line',
      line: { color: color(line.color, properties), width: valueAtZoom(line.width, zoom) },
    };
  }
  const fill =
    style.fill && accepts(style.fill.filter.geometry, 'polygon') && inZoom(style.fill, zoom)
      ? { color: color(style.fill.color, properties), opacity: style.fill.opacity ?? 1 }
      : undefined;
  const outline =
    style.outline && inZoom(style.outline, zoom)
      ? {
          color: color(style.outline.color, properties),
          width: valueAtZoom(style.outline.width, zoom),
        }
      : undefined;
  if (!fill && !outline) return;
  return { type: 'polygon', fill, outline };
}

/** True when a geometry filter (empty: unrestricted) admits this family. */
function accepts(families: readonly string[], family: 'point' | 'line' | 'polygon'): boolean {
  return families.length === 0 || families.includes(family);
}

/** True when a zoom is inside a style's `[minzoom, maxzoom)` range. */
function inZoom(style: { minzoom?: number; maxzoom?: number }, zoom: number): boolean {
  return zoom >= (style.minzoom ?? 0) && zoom < (style.maxzoom ?? Infinity);
}

/** A rule's color for a record; an uninterpreted expression draws in the unstyled gray. */
function color(rule: ColorRule, properties: Record<string, PropertyValue>): string {
  return colorFor(rule, properties) ?? UNSTYLED_COLOR;
}

/** The fallback symbol for a record the style does not know. */
function unstyled(geometry: RecordGeometry['type']): RecordSymbol {
  if (geometry === 'point') {
    return {
      type: 'point',
      point: { type: 'circle', radius: 3.5, color: UNSTYLED_COLOR, opacity: 0.9 },
    };
  }
  if (geometry === 'line') return { type: 'line', line: { color: UNSTYLED_COLOR, width: 1 } };
  return {
    type: 'polygon',
    fill: { color: UNSTYLED_COLOR, opacity: 0.15 },
    outline: { color: UNSTYLED_COLOR, width: 1 },
  };
}
