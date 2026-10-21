import type { LayerCatalog } from '../map/records/catalog';
import type { Sensor } from '../satellites/satelliteApi';
import { SOURCE_SENSOR, STATION_SENSOR } from '../satellites/testing/satelliteFixtures';
import {
  filterSensors,
  rfKinds,
  sensorFacts,
  sensorHit,
  sensorPoint,
  signalHit,
  signalRef,
  stationSourceId,
  stationsOf,
} from './rfView';

const STATION: Sensor = {
  ...STATION_SENSOR,
  geometry: { type: 'Point', coordinates: [-95.36, 29.76] },
  provenance: { sourceIds: ['satdump-1'] },
};
const RECEIVER: Sensor = {
  ref: 'sensor:receiver:local-aprs-1',
  type: 'sensor',
  title: 'APRS receiver',
  sensorKind: 'receiver',
  rangeKm: 150,
  families: ['aprs'],
  provenance: { sourceIds: ['local-aprs-1'] },
};
const PRODUCT: Sensor = {
  ref: 'sensor:raster-product:gfs',
  type: 'sensor',
  title: 'GFS 10 m wind',
  summary: 'Raster product (model)',
  sensorKind: 'raster-product',
  footprint: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 20],
        [0, 0],
      ],
    ],
  },
};

describe('the RF / Sensors view', () => {
  it('lists the RF / Spectrum category’s kinds', () => {
    const kinds = [
      { id: 'aprs-station', label: 'APRS Station', category: 'rf', sources: [], count: 3 },
    ];
    expect(
      rfKinds({
        categories: [
          { id: 'rf', label: 'RF / Spectrum', kinds, count: 3 },
          { id: 'hazards', label: 'Disasters / Hazards', kinds: [], count: 0 },
        ],
        kinds,
        sources: [],
      } as unknown as LayerCatalog),
    ).toEqual(kinds);
    expect(rfKinds(undefined)).toEqual([]);
  });

  it('filters the catalog by kind and text, ground stations and receivers first', () => {
    const all = [PRODUCT, SOURCE_SENSOR, RECEIVER, STATION];
    expect(filterSensors(all, 'all', '').map((sensor) => sensor.title)).toEqual([
      'SatDump Houston',
      'APRS receiver',
      'USGS Earthquakes',
      'GFS 10 m wind',
    ]);
    expect(filterSensors(all, 'receiver', '')).toEqual([RECEIVER]);
    expect(filterSensors(all, 'all', 'SEISMIC')).toEqual([SOURCE_SENSOR]);
    expect(filterSensors(all, 'all', 'model')).toEqual([PRODUCT]);
    expect(stationsOf(all)).toEqual([STATION, RECEIVER]);
  });

  it('reads a SatDump station’s polar plot by its source, and no other sensor’s', () => {
    expect(stationSourceId(STATION)).toBe('satdump-1');
    expect(stationSourceId(RECEIVER)).toBeUndefined();
  });

  it('places a sensor by its geometry or footprint, and selects it by its ref', () => {
    expect(sensorPoint(STATION)).toEqual([-95.36, 29.76]);
    expect(sensorPoint(PRODUCT)).toEqual([5, 10]);
    expect(sensorHit(STATION)).toEqual({
      id: { layer: 'sensor', kind: 'sensor', ref: 'sensor:station:satdump-1' },
      title: 'SatDump Houston',
      type: 'point',
      longitude: -95.36,
      latitude: 29.76,
      distance: 0,
    });
    expect(Number.isNaN(sensorHit(RECEIVER).longitude)).toBe(true);
  });

  it('selects a signal as the map would pick it', () => {
    const record = {
      source: 'local-aprs-1',
      externalId: 'K5ABC-9',
      kind: 'aprs-station',
      title: 'K5ABC-9',
      geometry: { type: 'Point', coordinates: [-95.1, 29.5] },
    } as never;
    expect(signalRef(record)).toBe('record:local-aprs-1/K5ABC-9');
    expect(signalHit(record)).toMatchObject({
      id: {
        layer: 'aprs-station',
        kind: 'aprs-station',
        source: 'local-aprs-1',
        externalId: 'K5ABC-9',
      },
      longitude: -95.1,
      latitude: 29.5,
    });
  });

  it('lists a sensor’s facts as the backend reports them, with its next pass', () => {
    const now = Date.parse('2026-10-21T00:00:00Z');
    expect(
      sensorFacts(
        {
          ...STATION,
          pDetect: 0.42,
          method: 'declared',
          capabilities: {
            operator: 'NOAA',
            sensorTypes: ['AVHRR'],
            resolutionM: 1100,
            swathKm: 2900,
          },
          passes: [
            { aos: '2026-10-20T22:00:00Z', los: '2026-10-20T22:10:00Z', maxElevationDeg: 10 },
            { aos: '2026-10-21T03:00:00Z', los: '2026-10-21T03:12:00Z', maxElevationDeg: 61.6 },
          ],
        },
        now,
      ),
    ).toEqual([
      { label: 'Sensor Kind', value: 'station' },
      { label: 'Families', value: 'weather-imagery' },
      { label: 'Detection', value: '42%' },
      { label: 'Method', value: 'declared' },
      { label: 'Range', value: '2,500 km' },
      { label: 'Operator', value: 'NOAA' },
      { label: 'Sensor Types', value: 'AVHRR' },
      { label: 'Resolution', value: '1100 m' },
      { label: 'Swath', value: '2,900 km' },
      { label: 'Next Pass', value: '2026-10-21 03:00Z, max 62°' },
    ]);
  });
});
