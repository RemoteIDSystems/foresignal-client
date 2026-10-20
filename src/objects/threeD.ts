/**
 * The 3D views a kind has (014's contextual 3D): an altitude track, an orbit or trajectory, or a
 * storm's structure. The backend's API has no field for this, so the client decides by kind.
 */
export type ThreeDView = 'altitude' | 'orbit' | 'storm';

/** Kinds with a 3D view, and which. */
const THREE_D_KINDS: Readonly<Record<string, ThreeDView>> = {
  aircraft: 'altitude',
  'derived-aircraft': 'altitude',
  drone: 'altitude',
  satellite: 'orbit',
  'satellite-pass': 'orbit',
  launch: 'orbit',
  'spacetrack-tip': 'orbit',
  cyclone: 'storm',
  'cyclone-track': 'storm',
  'cyclone-cone': 'storm',
  'cyclone-forecast-point': 'storm',
  'storm-track': 'storm',
};

/**
 * The 3D view a record kind has, or undefined for a kind that reads best on the 2D map (the
 * selection keeps the map in 2D then).
 */
export function threeDViewOf(kind: string | undefined): ThreeDView | undefined {
  return kind === undefined ? undefined : THREE_D_KINDS[kind];
}

/** True for storm-like kinds, whose dossier shows the Forecast Track mini-map. */
export function isStormLike(kind: string | undefined): boolean {
  return threeDViewOf(kind) === 'storm';
}
