/** Overlay styling: the backend's MapLibre overlay style as a model, its sprite, legend and attribution. */
export { MapAttribution, type MapAttributionProps } from './attribution';
export {
  attributionHref,
  creditList,
  requiredAttributions,
  type Attribution,
} from './attributionModel';
export { MapLegend, type MapLegendProps } from './legend';
export {
  buildLegend,
  legendTooltip,
  zoomNotes,
  type LegendEntry,
  type LegendVariant,
} from './legendModel';
export {
  loadMapIcon,
  loadOverlayStyle,
  type LoadOverlayStyleOptions,
  type OverlayStyle,
} from './loadOverlayStyle';
export {
  colorFor,
  kindLabel,
  representativeColor,
  sourceLayer,
  stylesForKind,
  valueAtZoom,
  type AggregationStyle,
  type CircleStyle,
  type ColorRule,
  type FeatureFilter,
  type FillStyle,
  type GeometryKind,
  type IconStyle,
  type KindStyle,
  type LineStyle,
  type SourceLayer,
  type StyleModel,
  type ZoomRamp,
  type ZoomValue,
} from './model';
export { parseOverlayStyle, type MapStyle } from './parseStyle';
export {
  OVERSIZED_FACTOR,
  renderSdf,
  SDF_INNER_EDGE,
  SpriteSheet,
  spriteFileName,
  type SdfPaint,
  type SpriteIndex,
} from './sprite';
export { useOverlayStyle, type OverlayStyleState } from './useOverlayStyle';
