import { prettifyId } from '../lib/labels';
import type { Glance, StatsGrid, StatsTop } from './glanceApi';

/** The backend's health in a word, and its tone. */
export function statusLook(status: Glance['status'] | undefined): {
  label: string;
  tone: 'ok' | 'warn' | 'alert' | 'none';
} {
  switch (status) {
    case 'ok':
      return { label: 'Operational', tone: 'ok' };
    case 'degraded':
      return { label: 'Degraded', tone: 'warn' };
    case 'failing':
      return { label: 'Failing', tone: 'alert' };
    default:
      return { label: 'Connecting', tone: 'none' };
  }
}

/**
 * The alerts in a few words: the open counts by severity when the backend gives them (a token, or
 * counts exposed to anonymous callers), else the latest alert's short title, else that there is
 * none.
 */
export function alertsText(glance: Glance | undefined): string {
  const open = glance?.alerts?.open;
  if (open) {
    const parts = [
      open.critical ? `${open.critical} critical` : '',
      open.warning ? `${open.warning} warning` : '',
      open.info ? `${open.info} info` : '',
    ].filter(Boolean);
    return parts.length > 0 ? `Alerts: ${parts.join(', ')}` : 'No open alerts';
  }
  const latest = glance?.alerts?.latest?.[0];
  if (latest) return `Latest alert: ${latest.shortTitle ?? latest.severity}`;
  return 'No recent alerts';
}

/** A ranking's leader, named and counted (`USGS Earthquakes 492`), or undefined when empty. */
export function leader(top: StatsTop | undefined): { label: string; count: number } | undefined {
  const first = top?.items[0];
  if (!first) return undefined;
  return { label: prettifyId(first.sourceId ?? first.kind ?? first.key), count: first.count };
}

/** One heat cell on the equirectangular inset: its outline in inset units and its weight, 0–1. */
export interface HeatCell {
  id: string;
  /** The cell's center on the plane: the mean of its outline's corners. */
  x: number;
  y: number;
  weight: number;
}

/**
 * The grid's cells as points on an equirectangular 360 × 180 plane (x is longitude + 180, y is
 * 90 − latitude), weighted by the square root of their share of the largest value so that quiet
 * cells still show. A cell is placed at its outline's center; at the inset's size a whole cell is
 * a pixel or two, so it is drawn as a dot. The backend splits cells at the antimeridian, so each
 * part has its own center and none wraps.
 */
export function heatCells(grid: StatsGrid | undefined): HeatCell[] {
  const features = grid?.features ?? [];
  const top = Math.max(1, ...features.map((feature) => feature.properties.value));
  const cells: HeatCell[] = [];
  features.forEach((feature, index) => {
    const { geometry } = feature;
    const rings =
      geometry.type === 'Polygon'
        ? [(geometry.coordinates as number[][][])[0]!]
        : geometry.type === 'MultiPolygon'
          ? (geometry.coordinates as number[][][][]).map((polygon) => polygon[0]!)
          : [];
    rings.forEach((ring, part) =>
      cells.push({
        id: `${feature.id ?? index}-${part}`,
        x: ring.reduce((sum, [lon]) => sum + lon! + 180, 0) / ring.length,
        y: ring.reduce((sum, [, lat]) => sum + 90 - lat!, 0) / ring.length,
        weight: Math.sqrt(feature.properties.value / top),
      }),
    );
  });
  return cells;
}
