/**
 * Display labels for backend ids (record kinds, tile layer ids). The API carries no display names
 * for these, so labels are derived from the id: words split on `-` and `_`, title-cased, with
 * acronyms and product names spelled as their owners spell them, and a short override table for
 * ids no rule reads well. Presentation only: the id is what crosses the wire.
 */

/** Tokens spelled a fixed way: acronyms (`aprs` → `APRS`) and product names (`shakemap`). */
export const LABEL_TOKENS: Readonly<Record<string, string>> = {
  adsb: 'ADS-B',
  ais: 'AIS',
  aprs: 'APRS',
  bgp: 'BGP',
  c2: 'C2',
  cap: 'CAP',
  cdc: 'CDC',
  cve: 'CVE',
  epss: 'EPSS',
  faa: 'FAA',
  ft8: 'FT8',
  gbfs: 'GBFS',
  gps: 'GPS',
  hf: 'HF',
  metar: 'METAR',
  mmi: 'MMI',
  nasa: 'NASA',
  noaa: 'NOAA',
  nws: 'NWS',
  osm: 'OSM',
  pirep: 'PIREP',
  probsevere: 'ProbSevere',
  rf: 'RF',
  sdr: 'SDR',
  shakemap: 'ShakeMap',
  sigint: 'SIGINT',
  spc: 'SPC',
  taf: 'TAF',
  tfr: 'TFR',
  uas: 'UAS',
  uav: 'UAV',
  uturn: 'U-Turn',
  url: 'URL',
  usgs: 'USGS',
  uv: 'UV',
  xray: 'X-Ray',
};

/** Whole ids whose derived label reads wrong, and what to show instead. */
export const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  'aerodrome-osm': 'Aerodrome (OSM)',
  'attention-top': 'Top Attention',
  cpa: 'Closest Point of Approach',
  // The id keeps the backend's spelling; the label is US English.
  'data-centre-osm': 'Data Center (OSM)',
  'mil-naval-cooccurrence': 'Military–Naval Co-occurrence',
  'pol-deviation': 'Pattern-of-Life Deviation',
  'pol-place': 'Pattern-of-Life Place',
  'port-osm': 'Port (OSM)',
  'power-plant-osm': 'Power Plant (OSM)',
  'series-latest': 'Series (Latest)',
  'wx-area': 'Weather Area',
};

/** Words kept lowercase inside a title. */
const MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
]);

/**
 * A readable label for an id: `aprs-station` → `APRS Station`, `conflict-event` → `Conflict
 * Event`, `data-centre-osm` → `Data Center (OSM)`. Overrides win, then fixed tokens, then title
 * case; an empty id gives an empty label.
 */
export function prettifyId(id: string): string {
  const override = LABEL_OVERRIDES[id.toLowerCase()];
  if (override) return override;
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLowerCase();
      const fixed = LABEL_TOKENS[lower];
      if (fixed) return fixed;
      if (i > 0 && MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
