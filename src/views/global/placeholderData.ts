/**
 * Placeholder data for the Global Dashboard skeleton, transcribed from
 * `design/Foresignal Global Intelligence Dashboard.png`.
 *
 * Nothing here comes from the backend. Each block names the prompt that replaces it with real
 * data; delete a block when its prompt wires the panel.
 */

/** A row in the LAYERS rail. Replaced in 007 (`listTileLayers`) and 008 (`summarizeContext`). */
export interface PlaceholderLayer {
  id: string;
  name: string;
  icon: LayerIcon;
  enabled: boolean;
  count?: number;
}

/** Icon keys the rail knows how to draw. */
export type LayerIcon =
  | 'globe'
  | 'events'
  | 'aircraft'
  | 'maritime'
  | 'orbits'
  | 'weather'
  | 'imagery'
  | 'rf'
  | 'infrastructure'
  | 'cyber'
  | 'energy'
  | 'hazards'
  | 'conflict';

export const PLACEHOLDER_LAYERS: PlaceholderLayer[] = [
  { id: 'overview', name: 'Global Overview', icon: 'globe', enabled: true },
  { id: 'events', name: 'Events', icon: 'events', enabled: true, count: 127 },
  { id: 'aircraft', name: 'Aircraft (ADS-B)', icon: 'aircraft', enabled: false, count: 5842 },
  { id: 'maritime', name: 'Maritime (AIS)', icon: 'maritime', enabled: false, count: 3917 },
  { id: 'orbits', name: 'Satellite Orbits', icon: 'orbits', enabled: false, count: 1246 },
  { id: 'weather', name: 'Weather', icon: 'weather', enabled: true },
  { id: 'imagery', name: 'Imagery (Recent)', icon: 'imagery', enabled: false, count: 18 },
  { id: 'rf', name: 'RF / Spectrum', icon: 'rf', enabled: false, count: 342 },
  { id: 'infrastructure', name: 'Infrastructure', icon: 'infrastructure', enabled: true },
  { id: 'cyber', name: 'Cyber / Network', icon: 'cyber', enabled: false, count: 56 },
  { id: 'energy', name: 'Energy / Power', icon: 'energy', enabled: false, count: 34 },
  { id: 'hazards', name: 'Disasters / Hazards', icon: 'hazards', enabled: false, count: 27 },
  { id: 'conflict', name: 'Conflicts / Security', icon: 'conflict', enabled: false, count: 89 },
];

/** Related entities. Replaced in 016 (`listRelatedObjects`). */
export interface PlaceholderRelated {
  name: string;
  type: string;
  distance: string;
  status: string;
  statusTone: 'ok' | 'alert' | 'warn' | 'none';
}

export const PLACEHOLDER_RELATED: PlaceholderRelated[] = [
  {
    name: 'Norfolk Intl Airport',
    type: 'Airport',
    distance: '45 km',
    status: 'Operational',
    statusTone: 'ok',
  },
  {
    name: 'USS Dwight D. Eisenhower',
    type: 'Military',
    distance: '120 km',
    status: 'Underway',
    statusTone: 'ok',
  },
  {
    name: 'Port of Virginia',
    type: 'Port',
    distance: '38 km',
    status: 'Congestion Alert',
    statusTone: 'alert',
  },
  {
    name: 'NOAA-20',
    type: 'Satellite',
    distance: '',
    status: 'Overhead in 42 min',
    statusTone: 'none',
  },
  {
    name: 'FEMA Region III',
    type: 'Organization',
    distance: '',
    status: 'Responding',
    statusTone: 'warn',
  },
];

/** Recent imagery. Replaced in 028 (`getMedia` / `getMediaThumbnail`). */
export const PLACEHOLDER_IMAGERY = {
  capturedAt: '2025-09-18 13:41Z',
  sensor: 'Sentinel-2 (10m)',
  thumbnails: ['Recent', 'Optical', 'SAR', 'Infrared', 'Night', 'Archive'],
};
