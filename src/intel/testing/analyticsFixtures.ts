import type { ObjectEnvelope } from '../../objects/objectApi';
import type {
  AnalysisSeries,
  AnalyticFinding,
  ImpactRate,
  ProjectedImpact,
  SeriesData,
} from '../analyticsApi';
import { SITUATION_ID } from './fixtures';

/** The finding the 020 tests read. */
export const FINDING_ID = '01JA8Q0000000000000000000F';

/** The finding behind the projected impact. */
export const IMPACT_FINDING_ID = '01JA8Q0000000000000000000G';

/** The instant the series end at. */
export const SERIES_END = Date.parse('2026-10-18T00:00:00Z');

const DAY = 86_400_000;

/** A change-point finding linked to the 019 situation, with its base rate and a caveat. */
export const finding: AnalyticFinding = {
  id: FINDING_ID,
  findingType: 'change-point',
  title: 'Earthquake count rose in Northern California',
  severity: 'significant',
  status: 'open',
  detectedAt: '2026-10-18T06:00:00Z',
  regionCodes: ['US-CA'],
  private: false,
  situationId: SITUATION_ID,
  manifestId: '01JA8Q0000000000000000000H',
  evidence: {
    seriesRefs: ['rollup:day/*/earthquake/US-CA'],
    members: ['record:usgs-earthquakes/nc75095651'],
  },
  inference: {
    detector: { name: 'changepoint-cusum', version: '1.0.0' },
    stats: { effect: 3.2, levelBefore: 2, levelAfter: 9 },
    baseRate: {
      value: 0.5,
      unit: 'alarms-per-year',
      method: 'detector-false-alarm-rate',
      text: 'a change this large was flagged once in the previous 700 days',
    },
    explanation: 'Daily earthquake counts rose from 2 to 9 on 2026-10-12.',
  },
  caveats: [{ code: 'FEW_EVENTS', text: 'Fewer than 30 events in the window.' }],
};

/** The finding's envelope, offering the dismissal. */
export const findingEnvelope: ObjectEnvelope = {
  ref: `finding:${FINDING_ID}`,
  type: 'finding',
  title: finding.title,
  actions: [
    {
      id: 'dismiss',
      method: 'PATCH',
      href: `/v1/analytics/findings/${FINDING_ID}`,
      scope: 'agent',
    },
  ],
};

/** A projected wind-driven outage in California. */
export const impact: ProjectedImpact = {
  findingId: IMPACT_FINDING_ID,
  hazard: {
    hazardType: 'wind',
    sourceRef: 'record:noaa-spc-outlooks/day1-wind@12',
    issuer: 'official',
    issuedAt: '2026-10-18T06:00:00Z',
    validFrom: '2026-10-18T12:00:00Z',
    validTo: '2026-10-19T12:00:00Z',
    probabilityModel: 'published-polygons',
  },
  impactFamily: 'outage',
  admin1: 'US-CA',
  admin1Name: 'California',
  regionClass: 'admin1:coastal',
  pHazard: 0.3,
  pConditional: 0.5,
  pImpact: 0.15,
  interval: { lo: 0.1, hi: 0.2 },
  n: 42,
  labels: ['modelled; heuristic links may be wrong; not an official warning'],
  status: 'active',
  detectedAt: '2026-10-18T06:00:00Z',
};

/** The historical rate matching {@link impact}. */
export const rate: ImpactRate = {
  hazardClass: 'wind',
  impactFamily: 'outage',
  regionClass: 'admin1:coastal',
  rate: 0.5,
  interval: { lo: 0.4, hi: 0.6 },
  n: 42,
  status: 'ok',
  computedAt: '2026-10-17T00:00:00Z',
};

/** A rate with too little history. */
export const thinRate: ImpactRate = {
  hazardClass: 'hail',
  impactFamily: 'outage',
  regionClass: 'admin1:inland',
  rate: null,
  n: 7,
  status: 'insufficient',
  computedAt: '2026-10-17T00:00:00Z',
};

/** An analysis series of a region and family. */
export function series(ref: string, family: string | null): AnalysisSeries {
  return {
    ref,
    enabled: true,
    detectors: ['changepoint-cusum'],
    frequency: 'day',
    family,
    regionCode: 'US-CA',
    origin: 'auto',
  };
}

/** The situation's region series: earthquakes and quarry blasts (seismic), outages (outage). */
export const regionSeries: AnalysisSeries[] = [
  series('rollup:day/*/power-outage/US-CA', 'outage'),
  series('rollup:day/*/earthquake/US-CA', 'seismic'),
  series('rollup:day/*/quarry-blast/US-CA', 'seismic'),
];

/**
 * Daily points ending at {@link SERIES_END}: `recent` a day over the last 30 days (days 0–29
 * back) and `earlier` a day over the 30 before (days 30–59 back).
 */
export function seriesData(ref: string, recent: number, earlier: number): SeriesData {
  const points = Array.from({ length: 60 }, (_, back) => {
    const start = SERIES_END - back * DAY;
    return {
      period: new Date(start).toISOString().slice(0, 10),
      periodStart: new Date(start).toISOString(),
      periodEnd: new Date(start + DAY).toISOString(),
      value: back < 30 ? recent : earlier,
      unit: 'events',
      status: 'final' as const,
    };
  }).reverse();
  return {
    ref,
    from: new Date(SERIES_END - 59 * DAY).toISOString(),
    to: new Date(SERIES_END + DAY).toISOString(),
    frequency: 'day',
    unit: 'events',
    family: null,
    valuesWithheld: false,
    points,
    gaps: [],
  };
}
