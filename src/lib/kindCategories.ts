/**
 * The Global mock's layer categories, and which category each record kind belongs to. This is
 * presentation: the backend has no category for a kind, so the rail groups kinds by this table. A
 * kind it does not name (a new one from the backend) falls into {@link OTHER_CATEGORY}.
 */

/** A category of record kinds, as the Global mock's LAYERS rail lists them. */
export interface KindCategory {
  id: CategoryId;
  /** The rail label, as the mock writes it. */
  label: string;
}

/** The category ids, in the mock's order, then the fallback. */
export type CategoryId =
  | 'events'
  | 'aircraft'
  | 'maritime'
  | 'satellites'
  | 'weather'
  | 'imagery'
  | 'rf'
  | 'infrastructure'
  | 'cyber'
  | 'energy'
  | 'hazards'
  | 'conflicts'
  | 'other';

/** The category of a kind this table does not name. */
export const OTHER_CATEGORY: CategoryId = 'other';

/** The categories in rail order: the Global mock's, then Other. */
export const KIND_CATEGORIES: readonly KindCategory[] = [
  { id: 'events', label: 'Events' },
  { id: 'aircraft', label: 'Aircraft (ADS-B)' },
  { id: 'maritime', label: 'Maritime (AIS)' },
  { id: 'satellites', label: 'Satellite Orbits' },
  { id: 'weather', label: 'Weather' },
  { id: 'imagery', label: 'Imagery (Recent)' },
  { id: 'rf', label: 'RF / Spectrum' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'cyber', label: 'Cyber / Network' },
  { id: 'energy', label: 'Energy / Power' },
  { id: 'hazards', label: 'Disasters / Hazards' },
  { id: 'conflicts', label: 'Conflicts / Security' },
  { id: 'other', label: 'Other' },
];

/** The categories the Global mock shows checked; their kinds are on when the dashboard opens. */
export const DEFAULT_CATEGORIES: readonly CategoryId[] = ['events', 'weather', 'infrastructure'];

/**
 * Kinds by category. Where a kind could sit in two, it sits where its feeds do (the source that
 * produces it): `deception` is the position-integrity check, so RF; `loiter`, `cpa` and
 * `rendezvous` are derived from vessel tracks, so Maritime; space weather is Weather.
 */
const KINDS: Record<Exclude<CategoryId, 'other'>, readonly string[]> = {
  events: [
    'analytic-finding',
    'anomaly',
    'attention-top',
    'bulletin',
    'corroboration',
    'dataset-release',
    'filing',
    'hypothesis-set',
    'intelligence-event',
    'media-rating',
    'news-article',
    'news-story',
    'pol-deviation',
    'pol-place',
    'regional-index',
    'regional-outlook',
    'sanction',
    'situation',
    'social-post',
    'travel-advisory',
    'window-state',
  ],
  aircraft: [
    'aerodrome-osm',
    'aircraft',
    'aircraft-registration',
    'airport',
    'airport-delay',
    'airspace-restriction',
    'aviation-hazard',
    'drone',
    'emergency-squawk',
    'holding-pattern',
    'navaid',
    'pirep',
    'receiver-status',
    'uas-facility-cell',
    'uas-restriction',
    'uas-site',
  ],
  maritime: [
    'ais-gap',
    'ais-receiver',
    'chokepoint-activity',
    'chokepoint-transit',
    'chokepoint-uturn',
    'cpa',
    'dark-vessel-candidate',
    'fishing-event',
    'loiter',
    'loitering-event',
    'maritime-warning',
    'port',
    'port-activity',
    'port-area',
    'port-call',
    'port-disruption',
    'port-osm',
    'port-visit',
    'rendezvous',
    'vessel',
    'vessel-encounter',
  ],
  satellites: [
    'close-approach',
    'conjunction',
    'ground-station',
    'launch',
    'launch-pad',
    'launch-site',
    'reentry-prediction',
    'satellite',
    'satellite-pass',
  ],
  weather: [
    'air-quality',
    'buoy-observation',
    'cyclone',
    'cyclone-cone',
    'cyclone-forecast-point',
    'cyclone-track',
    'cyclone-warning',
    'fire-weather',
    'forecast-area',
    'geomagnetic-index',
    'indoor-air-quality',
    'lightning-cluster',
    'metar',
    'nws-alert',
    'nws-forecast',
    'place-weather',
    'probsevere-object',
    'radar-cell',
    'radiosonde',
    'rainfall-outlook',
    'river-gauge',
    'snow-observation',
    'solar-flare',
    'solar-wind',
    'space-weather-alert',
    'space-weather-event',
    'space-weather-notice',
    'space-weather-scales',
    'spc-outlook',
    'storm-report',
    'storm-swath',
    'storm-track',
    'taf',
    'tide-gauge',
    'uv-forecast',
    'water-observation',
    'weather-observation',
    'wind-probability',
    'wx-area',
    'xray-current',
  ],
  imagery: ['camera', 'raster-frame', 'satellite-scene'],
  rf: [
    'aprs-message',
    'aprs-station',
    'deception',
    'hf-propagation-anomaly',
    'jamming-cell',
    'mesh-message',
    'mesh-node',
    'radio-spot',
    'radio-station',
    'scanner',
    'sdr-receiver',
  ],
  infrastructure: [
    'bikeshare-station',
    'cable',
    'cable-landing',
    'cable-proximity-risk',
    // The backend's kind id (it crosses the wire); its label is "Data Center (OSM)".
    'data-centre-osm',
    'hospital',
    'road-event',
    'telecom-exchange',
    'train',
    'transit-alert',
    'transit-vehicle',
    'water-facility',
  ],
  cyber: [
    'bgp-hijack',
    'bgp-leak',
    'bgp-prefix-state',
    'certificate-issuance',
    'cve-epss',
    'internet-outage',
    'malware-c2',
    'malware-url',
    'outage',
    'probe-status',
    'service-incident',
    'service-status',
    'vulnerability',
  ],
  energy: [
    'frequency-excursion',
    'grid-frequency',
    'nuclear-plant',
    'nuclear-reactor',
    'power-line',
    'power-plant',
    'power-plant-osm',
    'series-latest',
    'series-point',
    'substation',
  ],
  hazards: [
    'cap-alert',
    'disaster',
    'disaster-declaration',
    'disease-outbreak',
    'drought-area',
    'earthquake',
    'earthquake-impact',
    'emergency-activation',
    'felt-report-estimate',
    'fire-cluster',
    'fire-detection',
    'fire-incident',
    'fire-perimeter',
    'fireball',
    'flood-warning',
    'holdover-fire-risk',
    'natural-event',
    'radiation',
    'shakemap-mmi',
    'smoke-polygon',
    'tsunami-warning',
    'volcano',
    'volcano-alert',
    'wastewater-detection',
    'wastewater-level',
  ],
  conflicts: [
    'air-raid-alert',
    'conflict-event',
    'displacement',
    'frontline',
    'mil-naval-cooccurrence',
    'threat-alert',
  ],
};

const CATEGORY_OF = new Map<string, CategoryId>(
  Object.entries(KINDS).flatMap(([category, kinds]) =>
    kinds.map((kind) => [kind, category as CategoryId] as const),
  ),
);

/** The category a kind is listed under; {@link OTHER_CATEGORY} for a kind the table does not name. */
export function categoryOf(kind: string): CategoryId {
  return CATEGORY_OF.get(kind) ?? OTHER_CATEGORY;
}
