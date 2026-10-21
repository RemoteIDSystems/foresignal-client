import type { Satellite } from './constellation';
import { apsides, elementAgeHours, orbitType, periodMinutes, positionAt } from './orbit';
import { recordField, type SatelliteRecord, type Sensor } from './satelliteApi';

/** A bounding box: west, south, east, north. */
export type Bbox = readonly [number, number, number, number];

/** The scrubber's reach either side of now, in hours, and the ticks the mock labels. */
export const SCRUB_HOURS = 24;
export const SCRUB_TICKS: readonly { hours: number; label: string }[] = [
  { hours: -24, label: '-24h' },
  { hours: -6, label: '-6h' },
  { hours: 0, label: 'Now' },
  { hours: 6, label: '+6h' },
  { hours: 24, label: '+24h' },
];

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

/** The middle of an area, for passes over it; across the antimeridian, the middle of the wrap. */
export function centerOf(area: Bbox): { longitude: number; latitude: number } {
  const [west, south, east, north] = area;
  const span = east >= west ? east - west : east + 360 - west;
  let longitude = west + span / 2;
  if (longitude > 180) longitude -= 360;
  return { longitude, latitude: (south + north) / 2 };
}

/** One row of Upcoming Passes: a satellite sensor's predicted pass over the area. */
export interface PassRow {
  key: string;
  satellite: string;
  /** The catalog number the sensor names, when its ref or title gives one. */
  norad?: number;
  /** The sensor types it carries, in the backend's words. */
  types: string;
  aos: string;
  los: string;
  maxElevationDeg: number;
  minutes: number;
}

/** A satellite sensor's catalog number: the last number in its ref, if any. */
export function sensorNorad(sensor: Sensor): number | undefined {
  const match = /(\d{1,9})(?!.*\d)/.exec(sensor.ref);
  return match ? Number(match[1]) : undefined;
}

/**
 * The passes in the window, soonest first, from the satellite sensors `listSensors` predicted for
 * the area; those already over at `now` are left out.
 */
export function passRows(sensors: readonly Sensor[], now: Date): PassRow[] {
  const rows: PassRow[] = [];
  for (const sensor of sensors) {
    if (sensor.sensorKind !== 'satellite') continue;
    const norad = sensorNorad(sensor);
    for (const pass of sensor.passes ?? []) {
      if (Date.parse(pass.los) < now.getTime()) continue;
      rows.push({
        key: `${sensor.ref}|${pass.aos}`,
        satellite: sensor.title,
        ...(norad !== undefined && { norad }),
        types: sensor.capabilities?.sensorTypes?.join(', ') || '—',
        aos: pass.aos,
        los: pass.los,
        maxElevationDeg: pass.maxElevationDeg,
        minutes: Math.max(0, Math.round((Date.parse(pass.los) - Date.parse(pass.aos)) / 60_000)),
      });
    }
  }
  return rows.sort((a, b) => a.aos.localeCompare(b.aos));
}

/**
 * The satellite sensor `listSensors` returned for a satellite: by catalog number in its ref, else
 * by the same name.
 */
export function sensorOf(satellite: Satellite, sensors: readonly Sensor[]): Sensor | undefined {
  const satellites = sensors.filter((sensor) => sensor.sensorKind === 'satellite');
  return (
    satellites.find((sensor) => sensorNorad(sensor) === satellite.norad) ??
    satellites.find((sensor) => sensor.title.toLowerCase() === satellite.name.toLowerCase())
  );
}

/** One label and value of the Selected Satellite panel. */
export interface Fact {
  label: string;
  value: string;
}

/** A record field as text, when it has one. */
function fieldText(record: SatelliteRecord | undefined, ...names: string[]): string | undefined {
  if (!record) return undefined;
  for (const name of names) {
    const value = recordField(record, name);
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return undefined;
}

/** A number with a fixed count of decimals and a unit, in US English digits. */
function measure(value: number, decimals: number, unit: string): string {
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${unit}`;
}

/**
 * The Selected Satellite panel's facts, in the mock's order: Operator, NORAD ID, Launch Date,
 * Orbit Type, Altitude, Inclination, Period and Status. The elements give the catalog number, the
 * orbit and (by SGP4 at `at`) the altitude; the record and the sensor give what the elements do
 * not, when they carry it (shown as "—" otherwise). The elements' age follows.
 */
export function satelliteFacts(
  satellite: Satellite,
  at: Date,
  record: SatelliteRecord | undefined,
  sensor: Sensor | undefined,
): Fact[] {
  const { element } = satellite;
  const position = positionAt(satellite.satrec, at);
  const { perigeeKm, apogeeKm } = apsides(element);
  const age = elementAgeHours(element, at);
  return [
    {
      label: 'Operator',
      value: fieldText(record, 'OWNER', 'OPERATOR') ?? sensor?.capabilities?.operator ?? '—',
    },
    { label: 'NORAD ID', value: String(satellite.norad) },
    { label: 'Intl. Designator', value: satellite.objectId },
    { label: 'Launch Date', value: fieldText(record, 'LAUNCH_DATE') ?? '—' },
    { label: 'Orbit Type', value: orbitType(element) },
    {
      label: 'Altitude',
      value: position
        ? measure(position.heightKm, 0, ' km')
        : `${measure(perigeeKm, 0, '')}–${measure(apogeeKm, 0, ' km')}`,
    },
    { label: 'Inclination', value: measure(element.INCLINATION, 1, '°') },
    { label: 'Period', value: measure(periodMinutes(element), 1, ' min') },
    { label: 'Status', value: fieldText(record, 'OPS_STATUS_CODE', 'STATUS') ?? '—' },
    {
      label: 'Elements',
      value:
        age < 48 ? `${Math.max(0, Math.round(age))} h old` : `${Math.round(age / 24)} days old`,
    },
  ];
}

/** "in 2 h 14 min" (or "now") from `at` to an instant. */
export function untilText(at: Date, then: Date): string {
  const minutes = Math.round((then.getTime() - at.getTime()) / 60_000);
  if (minutes <= 0) return 'now';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `in ${hours} h ${minutes % 60} min` : `in ${minutes} min`;
}
