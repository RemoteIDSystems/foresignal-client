import { buildConstellation } from './constellation';
import {
  areaOf,
  centerOf,
  passRows,
  satelliteFacts,
  sensorNorad,
  sensorOf,
  untilText,
} from './satelliteView';
import {
  ISS,
  SENTINEL,
  SENTINEL_SENSOR,
  SOURCE_SENSOR,
  STATION_SENSOR,
} from './testing/satelliteFixtures';

const [iss, sentinel] = buildConstellation([{ source: 'stations', elements: [ISS, SENTINEL] }]);

describe('the satellite view', () => {
  it('discovers sensors for the view to whole degrees, or the world before it commits one', () => {
    expect(areaOf([-95.4, 29.2, -94.6, 30.1])).toEqual([-96, 29, -94, 31]);
    expect(areaOf(undefined)).toEqual([-180, -90, 180, 90]);
    expect(areaOf([-180.5, -91, 181, 92])).toEqual([-180, -90, 180, 90]);
  });

  it('centers an area, across the antimeridian too', () => {
    expect(centerOf([-96, 29, -94, 31])).toEqual({ longitude: -95, latitude: 30 });
    expect(centerOf([170, -10, -170, 10])).toEqual({ longitude: 180, latitude: 0 });
    expect(centerOf([160, 0, -160, 0]).longitude).toBe(180);
    expect(centerOf([170, 0, -150, 0]).longitude).toBe(-170);
  });

  it('lists the satellite sensors’ passes, soonest first, without those already over', () => {
    const later = {
      ...SENTINEL_SENSOR,
      ref: 'sensor:satellite:25544',
      title: 'ISS (ZARYA)',
      capabilities: null,
      passes: [
        { aos: '2026-10-21T08:00:00Z', los: '2026-10-21T08:06:00Z', maxElevationDeg: 30 },
        { aos: '2026-10-20T08:00:00Z', los: '2026-10-20T08:06:00Z', maxElevationDeg: 30 },
      ],
    };
    const rows = passRows(
      [SENTINEL_SENSOR, later, STATION_SENSOR],
      new Date('2026-10-21T00:00:00Z'),
    );
    expect(rows.map((row) => [row.satellite, row.aos, row.norad, row.types, row.minutes])).toEqual([
      ['ISS (ZARYA)', '2026-10-21T08:00:00Z', 25544, '—', 6],
      ['SENTINEL-2A', '2026-10-21T10:00:00Z', 40697, 'MSI', 9],
    ]);
  });

  it('matches a satellite to its sensor by catalog number, else by name', () => {
    expect(sensorNorad(SENTINEL_SENSOR)).toBe(40697);
    expect(sensorNorad(SOURCE_SENSOR)).toBeUndefined();
    expect(sensorOf(sentinel!, [SOURCE_SENSOR, SENTINEL_SENSOR])).toBe(SENTINEL_SENSOR);
    const named = { ...SENTINEL_SENSOR, ref: 'sensor:satellite:iss', title: 'iss (zarya)' };
    expect(sensorOf(iss!, [named])).toBe(named);
    expect(sensorOf(iss!, [SENTINEL_SENSOR])).toBeUndefined();
  });

  it('lists the mock’s facts, from the elements, the record and the sensor', () => {
    const at = new Date('2026-10-20T00:00:00Z');
    const facts = Object.fromEntries(
      satelliteFacts(sentinel!, at, undefined, SENTINEL_SENSOR).map((fact) => [
        fact.label,
        fact.value,
      ]),
    );
    expect(facts).toMatchObject({
      Operator: 'ESA',
      'NORAD ID': '40697',
      'Intl. Designator': '2015-028A',
      'Launch Date': '—',
      'Orbit Type': 'Sun-synchronous',
      Inclination: '98.6°',
      Period: '100.7 min',
      Status: '—',
      Elements: '0 h old',
    });
    expect(facts.Altitude).toMatch(/^\d{3} km$/);
    const record = {
      id: 'celestrak-gp:25544',
      source: 'celestrak-gp',
      externalId: '25544',
      kind: 'satellite',
      version: 1,
      seq: 1,
      observedAt: '2026-10-20T00:00:00Z',
      payload: { OWNER: 'ISS', LAUNCH_DATE: '1998-11-20', OPS_STATUS_CODE: '+' },
    };
    const withRecord = satelliteFacts(iss!, new Date('2026-10-23T00:00:00Z'), record, undefined);
    expect(withRecord.map((fact) => fact.value)).toEqual(
      expect.arrayContaining(['ISS', '1998-11-20', '+', '3 days old', 'Low Earth orbit']),
    );
  });

  it('says how long until an instant', () => {
    const at = new Date('2026-10-20T12:00:00Z');
    expect(untilText(at, new Date('2026-10-20T14:14:00Z'))).toBe('in 2 h 14 min');
    expect(untilText(at, new Date('2026-10-20T12:09:00Z'))).toBe('in 9 min');
    expect(untilText(at, new Date('2026-10-20T11:00:00Z'))).toBe('now');
  });
});
