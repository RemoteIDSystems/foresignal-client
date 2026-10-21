import { recordRef } from '../lib/objectRef';
import type { KindEntry, LayerCatalog } from '../map/records/catalog';
import type { RecordHit } from '../map/records/recordPicking';
import { envelopePoint, formatPanelTime, type Fact } from '../objects/dossierView';
import type { Sensor, SensorKind } from '../satellites/satelliteApi';
import { geometryBox } from '../saved/savedView';
import type { RfRecord } from './rfApi';

/** The sensor kinds `listSensors` answers with, in the order the catalog lists them. */
export const SENSOR_KINDS: readonly SensorKind[] = [
  'station',
  'receiver',
  'source',
  'satellite',
  'scene',
  'raster-product',
];

/** The catalog filter: one sensor kind, or every kind. */
export type SensorFilter = SensorKind | 'all';

/** How many signals the signals list reads. */
export const SIGNAL_LIMIT = 50;

/** How often a ground station's polar plot is read again, in ms (it is cached for 5 s). */
export const POLARPLOT_REFRESH_MS = 5_000;

/** The kinds of the RF / Spectrum category (`lib/kindCategories`), most records first. */
export function rfKinds(catalog: LayerCatalog | undefined): KindEntry[] {
  return catalog?.categories.find((group) => group.id === 'rf')?.kinds ?? [];
}

/**
 * The sensors the catalog lists for a filter and a search: the chosen kind (or every kind), whose
 * title, summary or families contain the text, ground stations and receivers first.
 */
export function filterSensors(
  sensors: readonly Sensor[],
  filter: SensorFilter,
  text: string,
): Sensor[] {
  const needle = text.trim().toLowerCase();
  return sensors
    .filter((sensor) => filter === 'all' || sensor.sensorKind === filter)
    .filter(
      (sensor) =>
        !needle ||
        [sensor.title, sensor.summary ?? '', ...(sensor.families ?? [])].some((part) =>
          part.toLowerCase().includes(needle),
        ),
    )
    .sort(
      (a, b) =>
        SENSOR_KINDS.indexOf(a.sensorKind) - SENSOR_KINDS.indexOf(b.sensorKind) ||
        a.title.localeCompare(b.title),
    );
}

/** The ground stations and receivers among the sensors, stations first. */
export function stationsOf(sensors: readonly Sensor[]): Sensor[] {
  return filterSensors(sensors, 'all', '').filter(
    (sensor) => sensor.sensorKind === 'station' || sensor.sensorKind === 'receiver',
  );
}

/**
 * The source id a SatDump ground station's polar plot is read by (`getGroundStationPolarplot`):
 * its first provenance source. Other sensors have no polar plot.
 */
export function stationSourceId(sensor: Sensor): string | undefined {
  return sensor.sensorKind === 'station' ? sensor.provenance?.sourceIds?.[0] : undefined;
}

/** Where a sensor is: its own geometry or box, else the middle of its footprint. */
export function sensorPoint(sensor: Sensor): [number, number] | undefined {
  const own = envelopePoint(sensor);
  if (own) return own;
  const box = geometryBox(sensor.footprint);
  return box && envelopePoint({ ...sensor, geometry: null, bbox: box });
}

/**
 * A sensor as the shared selection (014) holds it: by its ref, at its position (non-finite when it
 * has none, so the map stays where it is).
 */
export function sensorHit(sensor: Sensor): RecordHit {
  const point = sensorPoint(sensor);
  return {
    id: { layer: 'sensor', kind: 'sensor', ref: sensor.ref },
    title: sensor.title,
    type: 'point',
    longitude: point?.[0] ?? Number.NaN,
    latitude: point?.[1] ?? Number.NaN,
    distance: 0,
  };
}

/** A signal's object ref. */
export function signalRef(record: RfRecord): string {
  return recordRef(record.source, record.externalId);
}

/** The first position of a GeoJSON geometry, for a signal without a box. */
function firstPosition(geometry: unknown): [number, number] | undefined {
  let at: unknown = (geometry as { coordinates?: unknown } | null | undefined)?.coordinates;
  while (Array.isArray(at) && Array.isArray(at[0])) at = at[0];
  return Array.isArray(at) && typeof at[0] === 'number' && typeof at[1] === 'number'
    ? [at[0], at[1]]
    : undefined;
}

/**
 * A signal as the shared selection holds it: as the map would pick it (layer and kind its kind,
 * with its source and id), at its first position.
 */
export function signalHit(record: RfRecord): RecordHit {
  const point = firstPosition(record.geometry);
  return {
    id: {
      layer: record.kind,
      kind: record.kind,
      source: record.source,
      externalId: record.externalId,
    },
    ...(record.title ? { title: record.title } : {}),
    type: 'point',
    longitude: point?.[0] ?? Number.NaN,
    latitude: point?.[1] ?? Number.NaN,
    distance: 0,
  };
}

/** A count of kilometers, rounded. */
function km(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} km`;
}

/**
 * A sensor's own facts, as `listSensors` reports them (values as the backend names them): kind,
 * families, detection probability and method, range, capabilities, acquisition and the next pass.
 */
export function sensorFacts(sensor: Sensor, now: number): Fact[] {
  const facts: Fact[] = [{ label: 'Sensor Kind', value: sensor.sensorKind }];
  if (sensor.families?.length) facts.push({ label: 'Families', value: sensor.families.join(', ') });
  if (sensor.pDetect != null)
    facts.push({ label: 'Detection', value: `${Math.round(sensor.pDetect * 100)}%` });
  if (sensor.method) facts.push({ label: 'Method', value: sensor.method });
  if (sensor.rangeKm != null) facts.push({ label: 'Range', value: km(sensor.rangeKm) });
  const capabilities = sensor.capabilities;
  if (capabilities?.operator) facts.push({ label: 'Operator', value: capabilities.operator });
  if (capabilities?.sensorTypes?.length)
    facts.push({ label: 'Sensor Types', value: capabilities.sensorTypes.join(', ') });
  if (capabilities?.resolutionM != null)
    facts.push({ label: 'Resolution', value: `${capabilities.resolutionM} m` });
  if (capabilities?.swathKm != null)
    facts.push({ label: 'Swath', value: km(capabilities.swathKm) });
  if (sensor.acquiredAt)
    facts.push({ label: 'Acquired', value: formatPanelTime(sensor.acquiredAt) });
  const next = (sensor.passes ?? [])
    .filter((pass) => Date.parse(pass.los) > now)
    .sort((a, b) => Date.parse(a.aos) - Date.parse(b.aos))[0];
  if (next)
    facts.push({
      label: 'Next Pass',
      value: `${formatPanelTime(next.aos)}, max ${Math.round(next.maxElevationDeg)}°`,
    });
  return facts;
}
