/** A bounding box: west, south, east, north. */
export type Bbox = readonly [number, number, number, number];

/**
 * The area the sensors are discovered for: the map's view, to a whole degree outward, so a camera
 * that moves a little does not read them again; the world before the map commits a view.
 */
export function areaOf(bbox: Bbox | undefined): Bbox {
  if (!bbox) return [-180, -90, 180, 90];
  const [west, south, east, north] = bbox;
  return [
    Math.max(-180, Math.floor(west)),
    Math.max(-90, Math.floor(south)),
    Math.min(180, Math.ceil(east)),
    Math.min(90, Math.ceil(north)),
  ];
}
