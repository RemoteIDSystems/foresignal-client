import {
  apsides,
  elementAgeHours,
  elevationFrom,
  groundTrack,
  nextPass,
  orbitRing,
  orbitType,
  periodMinutes,
  positionAt,
  toSatrec,
} from './orbit';
import {
  BROKEN,
  GOES,
  GPS,
  HOUSTON,
  ISS,
  ISS_HOUSTON_PASS,
  MOLNIYA,
  SENTINEL,
} from './testing/satelliteFixtures';

const AT_EPOCH = new Date('2026-10-20T00:00:00Z');
const iss = toSatrec(ISS)!;

describe('orbits', () => {
  it('propagates an element set by SGP4 to where the satellite is', () => {
    const position = positionAt(iss, AT_EPOCH)!;
    expect(position.longitude).toBeCloseTo(-178.47, 1);
    expect(position.latitude).toBeCloseTo(51.8, 1);
    expect(position.heightKm).toBeCloseTo(419.4, 0);
    const radius = Math.hypot(position.ecf.x, position.ecf.y, position.ecf.z) / 1000;
    expect(radius).toBeGreaterThan(6700);
    expect(radius).toBeLessThan(6800);
    expect(positionAt(toSatrec(GOES)!, AT_EPOCH)!.heightKm).toBeCloseTo(35_782, -1);
  });

  it('refuses element sets SGP4 cannot use', () => {
    expect(toSatrec(BROKEN)).toBeUndefined();
    // The drag terms and the set number may be absent.
    const bare = { ...ISS };
    delete bare.BSTAR;
    delete bare.MEAN_MOTION_DOT;
    delete bare.MEAN_MOTION_DDOT;
    delete bare.ELEMENT_SET_NO;
    expect(toSatrec(bare)).toBeDefined();
  });

  it('works out the period, apsides and orbit type from the elements', () => {
    expect(periodMinutes(ISS)).toBeCloseTo(92.9, 1);
    const { perigeeKm, apogeeKm } = apsides(ISS);
    expect(perigeeKm).toBeGreaterThan(380);
    expect(apogeeKm).toBeLessThan(440);
    expect(orbitType(ISS)).toBe('Low Earth orbit');
    expect(orbitType(SENTINEL)).toBe('Sun-synchronous');
    expect(orbitType(GOES)).toBe('Geostationary');
    expect(orbitType({ ...GOES, INCLINATION: 30 })).toBe('Geosynchronous');
    expect(orbitType(GPS)).toBe('Medium Earth orbit');
    expect(orbitType(MOLNIYA)).toBe('Highly elliptical');
    expect(orbitType({ ...GPS, MEAN_MOTION: 0.5 })).toBe('High Earth orbit');
  });

  it('reads the element set’s age from its zone-less epoch', () => {
    expect(elementAgeHours(ISS, new Date('2026-10-20T06:00:00Z'))).toBe(6);
    expect(elementAgeHours({ ...ISS, EPOCH: '2026-10-20T00:00:00Z' }, AT_EPOCH)).toBe(0);
  });

  it('draws a ring of one revolution through where the satellite is', () => {
    const ring = orbitRing(iss, ISS, AT_EPOCH, 90);
    expect(ring).toHaveLength(91);
    const here = positionAt(iss, AT_EPOCH)!.ecf;
    const middle = ring[45]!;
    expect(Math.hypot(middle.x - here.x, middle.y - here.y, middle.z - here.z)).toBeLessThan(1);
    // A revolution later it is back within a few kilometers: the ring closes.
    const first = ring[0]!;
    const last = ring[90]!;
    expect(Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) / 1000).toBeLessThan(
      10,
    );
  });

  it('draws a ground track split at the antimeridian', () => {
    const segments = groundTrack(iss, AT_EPOCH, 93, 93, 1);
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        expect(Math.abs(segment[i]!.longitude - segment[i - 1]!.longitude)).toBeLessThan(180);
      }
    }
    const latitudes = segments.flat().map((point) => point.latitude);
    expect(Math.max(...latitudes)).toBeLessThanOrEqual(52);
    expect(Math.min(...latitudes)).toBeGreaterThanOrEqual(-52);
  });

  it('finds the next pass over a place', () => {
    const pass = nextPass(iss, HOUSTON, AT_EPOCH, 24, 10, 30)!;
    expect(pass.aos.toISOString()).toBe(ISS_HOUSTON_PASS.aos);
    expect(pass.los.toISOString()).toBe(ISS_HOUSTON_PASS.los);
    expect(pass.maxElevationDeg).toBeCloseTo(ISS_HOUSTON_PASS.maxElevationDeg, 0);
    expect(pass.tca.getTime()).toBeGreaterThan(pass.aos.getTime());
    expect(elevationFrom(iss, HOUSTON, pass.tca)).toBeCloseTo(pass.maxElevationDeg, 5);
    // With every elevation accepted, the pass is under way from the start.
    const goes = nextPass(toSatrec(GOES)!, HOUSTON, AT_EPOCH, 1, -90, 600);
    expect(goes?.aos.getTime()).toBe(AT_EPOCH.getTime());
    // Nothing rises above 89° in an hour.
    expect(nextPass(iss, HOUSTON, AT_EPOCH, 1, 89)).toBeUndefined();
  });
});
