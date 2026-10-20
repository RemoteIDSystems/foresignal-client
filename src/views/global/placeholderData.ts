/**
 * Placeholder data for the Global Dashboard skeleton, transcribed from
 * `design/Foresignal Global Intelligence Dashboard.png`.
 *
 * Nothing here comes from the backend. Each block names the prompt that replaces it with real
 * data; delete a block when its prompt wires the panel.
 */
import type { BadgeTone } from '../../ui/Badge';

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

/** Activity timeline rows. Replaced in 015 (`summarizeContext` activity). */
export interface PlaceholderActivity {
  time: string;
  text: string;
  category: string;
  tone: BadgeTone;
}

export const PLACEHOLDER_ACTIVITY: PlaceholderActivity[] = [
  {
    time: '14:31',
    text: 'NORAD tracking 3 new objects (USSF)',
    category: 'Space',
    tone: 'neutral',
  },
  {
    time: '14:28',
    text: 'Unusual RF activity detected - 1.6 GHz (Iceland)',
    category: 'RF',
    tone: 'violet',
  },
  {
    time: '14:24',
    text: 'Port congestion increasing (Norfolk)',
    category: 'Maritime',
    tone: 'info',
  },
  {
    time: '14:18',
    text: 'Power grid frequency anomaly (ERCOT)',
    category: 'Energy',
    tone: 'success',
  },
  { time: '14:12', text: 'Cybersecurity advisory - new CVE', category: 'Cyber', tone: 'violet' },
  {
    time: '14:07',
    text: 'Earthquake M4.8 (Solomon Islands)',
    category: 'Geologic',
    tone: 'orange',
  },
  {
    time: '14:03',
    text: 'Military aircraft activity increase (Mediterranean)',
    category: 'Aviation',
    tone: 'info',
  },
  {
    time: '13:58',
    text: 'Wildfire growth rate accelerating (CA)',
    category: 'Hazard',
    tone: 'orange',
  },
  {
    time: '13:47',
    text: 'Satellite imagery update (Ukrainian border)',
    category: 'Conflict',
    tone: 'orange',
  },
  { time: '13:41', text: 'Shipping lane disruption (Red Sea)', category: 'Maritime', tone: 'info' },
];

/** Analytics & insights rows. Replaced in 015 (`summarizeContext` insights) and 022 (forecasts). */
export interface PlaceholderInsight {
  title: string;
  detail: string;
  probability: number;
  level: 'High' | 'Medium' | 'Low';
}

export const PLACEHOLDER_INSIGHTS: PlaceholderInsight[] = [
  {
    title: 'Florence expected to strengthen to Cat 2',
    detail: 'Based on atmospheric conditions and historical analogs',
    probability: 72,
    level: 'Medium',
  },
  {
    title: 'Port closures likely within 48 hours',
    detail: 'Similar storms caused closures in 78% of historical cases',
    probability: 68,
    level: 'Medium',
  },
  {
    title: 'Increased aircraft diversion activity',
    detail: 'Rerouting already observed across multiple carriers',
    probability: 81,
    level: 'High',
  },
  {
    title: 'Coastal power infrastructure at risk',
    detail: 'Storm track overlaps with vulnerable grid infrastructure',
    probability: 64,
    level: 'Medium',
  },
  {
    title: 'Potential for rapid intensification',
    detail: 'Conditions favorable but uncertainty remains high',
    probability: 38,
    level: 'Low',
  },
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
