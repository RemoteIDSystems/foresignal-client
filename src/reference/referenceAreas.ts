import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/** A named area found by `searchReferenceAreas` (161): a country, admin-1 region, or place. */
export type ReferenceArea = components['schemas']['ReferenceArea'];

/** The outline of a country or admin-1 region (`getReferenceArea`), simplified for display. */
export type ReferenceAreaOutline = components['schemas']['ReferenceAreaOutline'];

/** A GeoJSON geometry, as the map draws it. */
export type Geometry = components['schemas']['Geometry'];

/** The most areas a search returns. */
export const REFERENCE_AREA_LIMIT = 20;

/** Searches named reference areas by free text (`searchReferenceAreas`, gated `data.read`). */
export function searchReferenceAreas(
  api: ForesignalClient,
  q: string,
  signal?: AbortSignal,
): Promise<ReferenceArea[]> {
  return unwrap(
    api.GET('/v1/reference/areas', {
      params: { query: { q, limit: REFERENCE_AREA_LIMIT } },
      signal,
    }),
  );
}

/** Reads one area's outline by its geofence code (`getReferenceArea`). */
export function getReferenceArea(
  api: ForesignalClient,
  code: string,
  signal?: AbortSignal,
): Promise<ReferenceAreaOutline> {
  return unwrap(api.GET('/v1/reference/areas/{code}', { params: { path: { code } }, signal }));
}

/**
 * The geometry to draw for a selected area: a country/admin-1 region's fetched outline, or — for a
 * place, which has no outline — a point at its location. Returns `null` when a coded area has no
 * outline to fetch here.
 */
export async function areaGeometry(
  api: ForesignalClient,
  area: ReferenceArea,
  signal?: AbortSignal,
): Promise<{ label: string; geometry: Geometry } | null> {
  if (area.code) {
    const outline = await getReferenceArea(api, area.code, signal);
    return { label: area.label, geometry: outline.geometry };
  }
  // A place is a point; draw it where it sits.
  return { label: area.label, geometry: { type: 'Point', coordinates: [area.lon, area.lat] } };
}
