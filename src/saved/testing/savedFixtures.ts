import type { Place, SavedView, Watchlist } from '../savedApi';

/** A saved view of two kinds over the central United States. */
export function savedView(extra: Partial<SavedView> = {}): SavedView {
  return {
    id: 'view-1',
    slug: 'quakes-and-planes',
    name: 'Quakes and planes',
    kinds: ['earthquake', 'aircraft'],
    bbox: [-130, 20, -60, 55],
    timeField: 'effective',
    includeExpired: false,
    version: 1,
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    ...extra,
  };
}

/** A point place in Houston with a 20 km radius. */
export function place(extra: Partial<Place> = {}): Place {
  return {
    id: 'houston',
    name: 'Houston',
    shape: 'point',
    geometry: { type: 'Point', coordinates: [-95.36, 29.76] },
    radiusKm: 20,
    kind: 'user',
    sensitive: true,
    version: 1,
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    ...extra,
  } as Place;
}

/** A watchlist of aircraft. */
export function watchlist(extra: Partial<Watchlist> = {}): Watchlist {
  return {
    id: '01HVXK',
    name: 'Survey aircraft',
    identity: 'icao24',
    itemCount: 2,
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    ...extra,
  } as Watchlist;
}
