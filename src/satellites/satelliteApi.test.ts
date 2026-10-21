import { json, standInApi } from '../intel/testing/standIn';
import { findSatelliteRecord, getGpElements, listSensors, NO_GP_DATA } from './satelliteApi';
import { ISS, SENTINEL_SENSOR } from './testing/satelliteFixtures';

/** A plain-text answer, as the CelesTrak-compatible endpoint gives when nothing matches. */
const text = (body: string) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });

describe('the satellite reads', () => {
  it('reads element sets as CelesTrak JSON, by group or by name', async () => {
    const { api, asked } = standInApi({
      'GET /compat/celestrak/gp.php': (request) =>
        new URL(request.url).searchParams.get('GROUP') === 'stations'
          ? json([ISS])
          : text(NO_GP_DATA),
    });
    expect(await getGpElements(api, { group: 'stations' })).toEqual([ISS]);
    expect(await getGpElements(api, { name: 'SENTINEL' })).toEqual([]);
    expect(asked).toEqual([
      'GET /compat/celestrak/gp.php?FORMAT=json&GROUP=stations',
      'GET /compat/celestrak/gp.php?FORMAT=json&NAME=SENTINEL',
    ]);
  });

  it('says why element sets did not load', async () => {
    const { api } = standInApi({
      'GET /compat/celestrak/gp.php': () =>
        json({ title: 'Bad Request', status: 400, detail: 'SPECIAL is not supported.' }, 400),
    });
    await expect(getGpElements(api, { group: 'x' })).rejects.toThrow('SPECIAL is not supported.');
  });

  it('discovers the sensors over an area in a window', async () => {
    const { api, asked } = standInApi({
      'GET /v1/sensors': () =>
        json({
          from: '2026-10-21T00:00:00Z',
          to: '2026-10-22T00:00:00Z',
          items: [SENTINEL_SENSOR],
          note: 'Foresignal cannot task public satellites or third-party sensors',
        }),
    });
    const found = await listSensors(
      api,
      [-100, 25, -90, 35],
      '2026-10-21T00:00:00Z',
      '2026-10-22T00:00:00Z',
      ['satellite', 'station'],
    );
    expect(found.items).toEqual([SENTINEL_SENSOR]);
    const query = new URL(`http://x${asked[0]!.slice(4)}`).searchParams;
    expect(query.get('bbox')).toBe('-100,25,-90,35');
    expect(query.get('from')).toBe('2026-10-21T00:00:00Z');
    expect(query.get('limit')).toBe('500');
    expect(query.getAll('kinds').join(',')).toBe('satellite,station');
  });

  it('finds a satellite’s record by its designator and catalog number', async () => {
    const record = (externalId: string, norad: number) => ({
      id: `celestrak-gp:${externalId}`,
      source: 'celestrak-gp',
      externalId,
      kind: 'satellite',
      version: 1,
      seq: 1,
      observedAt: '2026-10-20T00:00:00Z',
      payload: { OBJECT_ID: '1998-067A', NORAD_CAT_ID: norad, OWNER: 'ISS' },
    });
    const { api, asked } = standInApi({
      'GET /v1/records': () =>
        json({ items: [record('1', 1), record('25544', 25544)], nextCursor: null }),
    });
    expect((await findSatelliteRecord(api, '1998-067A', 25544))?.externalId).toBe('25544');
    expect((await findSatelliteRecord(api, '1998-067A', 7))?.externalId).toBe('1');
    expect(asked[0]).toBe('GET /v1/records?kind=satellite&q=1998-067A&limit=20');
  });
});
