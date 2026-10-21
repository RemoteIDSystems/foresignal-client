import {
  degreesLat,
  degreesLong,
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  radiansToDegrees,
  SatRecError,
  type EciVec3,
  type OMMJsonObject,
  type SatRec,
} from 'satellite.js';
import type { GpElement } from './satelliteApi';

/** The Earth's gravitational parameter, km³/s² (WGS 84). */
const MU_KM3_S2 = 398_600.4418;

/** The Earth's equatorial radius, km (WGS 84). */
export const EARTH_RADIUS_KM = 6378.137;

/** Minutes in a solar day. */
const DAY_MINUTES = 1440;

/** A point in Earth-fixed (ECF) coordinates, in meters. */
export interface EcfPoint {
  x: number;
  y: number;
  z: number;
}

/** Where a satellite is at an instant: below it on the ground, its height, and in space. */
export interface SatellitePosition {
  longitude: number;
  latitude: number;
  heightKm: number;
  /** Earth-fixed, meters (Cesium's Cartesian3 in its fixed frame). */
  ecf: EcfPoint;
}

/** A pass over a place: rise, culmination and set, with the highest elevation reached. */
export interface Pass {
  aos: Date;
  tca: Date;
  los: Date;
  maxElevationDeg: number;
}

/**
 * The SGP4 record for an element set, or undefined when SGP4 cannot use it. The backend's element
 * may leave out the drag terms and the element set number, which default to zero.
 */
export function toSatrec(element: GpElement): SatRec | undefined {
  try {
    const satrec = json2satrec({
      ...element,
      ELEMENT_SET_NO: element.ELEMENT_SET_NO ?? 0,
      BSTAR: element.BSTAR ?? 0,
      MEAN_MOTION_DOT: element.MEAN_MOTION_DOT ?? 0,
      MEAN_MOTION_DDOT: element.MEAN_MOTION_DDOT ?? 0,
    } as OMMJsonObject);
    return satrec.error === SatRecError.None ? satrec : undefined;
  } catch {
    return undefined;
  }
}

/** The satellite's position in the inertial (TEME) frame at an instant, km; undefined on error. */
function eciAt(satrec: SatRec, at: Date): EciVec3<number> | undefined {
  const state = propagate(satrec, at);
  const position = state?.position;
  if (!position || !Number.isFinite(position.x)) return undefined;
  return position;
}

/** Earth-fixed meters from inertial km, at the sidereal time `gmst`. */
function toEcfMeters(eci: EciVec3<number>, gmst: number): EcfPoint {
  const ecf = eciToEcf(eci, gmst);
  return { x: ecf.x * 1000, y: ecf.y * 1000, z: ecf.z * 1000 };
}

/** Where the satellite is at an instant, by SGP4; undefined when it cannot be propagated then. */
export function positionAt(satrec: SatRec, at: Date): SatellitePosition | undefined {
  const eci = eciAt(satrec, at);
  if (!eci) return undefined;
  const gmst = gstime(at);
  const geodetic = eciToGeodetic(eci, gmst);
  return {
    longitude: degreesLong(geodetic.longitude),
    latitude: degreesLat(geodetic.latitude),
    heightKm: geodetic.height,
    ecf: toEcfMeters(eci, gmst),
  };
}

/** The orbital period, minutes, from the mean motion (revolutions a day). */
export function periodMinutes(element: GpElement): number {
  return DAY_MINUTES / element.MEAN_MOTION;
}

/** Perigee and apogee heights above the equator, km, from the mean motion and eccentricity. */
export function apsides(element: GpElement): { perigeeKm: number; apogeeKm: number } {
  const meanMotion = (element.MEAN_MOTION * 2 * Math.PI) / 86_400;
  const semiMajor = Math.cbrt(MU_KM3_S2 / (meanMotion * meanMotion));
  return {
    perigeeKm: semiMajor * (1 - element.ECCENTRICITY) - EARTH_RADIUS_KM,
    apogeeKm: semiMajor * (1 + element.ECCENTRICITY) - EARTH_RADIUS_KM,
  };
}

/**
 * The orbit's type, from its elements: geostationary or geosynchronous near a sidereal-day period,
 * highly elliptical above eccentricity 0.25, sun-synchronous for a low orbit inclined 95°–105°,
 * then low (apogee under 2,000 km), medium (under a 12-hour-plus period) or high Earth orbit.
 */
export function orbitType(element: GpElement): string {
  const period = periodMinutes(element);
  const { apogeeKm } = apsides(element);
  if (Math.abs(period - 1436) < 15 && element.ECCENTRICITY < 0.05) {
    return element.INCLINATION < 5 ? 'Geostationary' : 'Geosynchronous';
  }
  if (element.ECCENTRICITY > 0.25) return 'Highly elliptical';
  if (apogeeKm < 2000) {
    return element.INCLINATION >= 95 && element.INCLINATION <= 105
      ? 'Sun-synchronous'
      : 'Low Earth orbit';
  }
  return period < 1400 ? 'Medium Earth orbit' : 'High Earth orbit';
}

/** How old the element set is at `now`, in hours (its `EPOCH` is UTC without a zone). */
export function elementAgeHours(element: GpElement, now: Date): number {
  const epoch = Date.parse(
    /[zZ]|[+-]\d\d:\d\d$/.test(element.EPOCH) ? element.EPOCH : `${element.EPOCH}Z`,
  );
  return (now.getTime() - epoch) / 3_600_000;
}

/**
 * One revolution of the orbit as a closed ring, Earth-fixed at `at`: every sample is turned by the
 * sidereal time of that instant, so the ring passes through the satellite's place then, as the
 * mock's orbit paths do. `steps` samples (at least 8).
 */
export function orbitRing(satrec: SatRec, element: GpElement, at: Date, steps = 90): EcfPoint[] {
  const period = periodMinutes(element);
  const gmst = gstime(at);
  const ring: EcfPoint[] = [];
  const count = Math.max(8, steps);
  for (let i = 0; i <= count; i++) {
    const eci = eciAt(
      satrec,
      new Date(at.getTime() + ((i / count) * period - period / 2) * 60_000),
    );
    if (eci) ring.push(toEcfMeters(eci, gmst));
  }
  return ring;
}

/**
 * The ground track from `minutesBefore` to `minutesAfter` around `at`, one sample a `stepMinutes`,
 * as longitude and latitude; split where it crosses the antimeridian, so no segment wraps.
 */
export function groundTrack(
  satrec: SatRec,
  at: Date,
  minutesBefore: number,
  minutesAfter: number,
  stepMinutes = 1,
): { longitude: number; latitude: number }[][] {
  const segments: { longitude: number; latitude: number }[][] = [];
  let segment: { longitude: number; latitude: number }[] = [];
  for (let m = -minutesBefore; m <= minutesAfter; m += stepMinutes) {
    const position = positionAt(satrec, new Date(at.getTime() + m * 60_000));
    if (!position) continue;
    const last = segment.at(-1);
    if (last && Math.abs(position.longitude - last.longitude) > 180) {
      segments.push(segment);
      segment = [];
    }
    segment.push({ longitude: position.longitude, latitude: position.latitude });
  }
  if (segment.length > 0) segments.push(segment);
  return segments.filter((part) => part.length > 1);
}

/** A satellite's elevation above the horizon from a place on the ground, degrees. */
export function elevationFrom(
  satrec: SatRec,
  observer: { longitude: number; latitude: number },
  at: Date,
): number | undefined {
  const eci = eciAt(satrec, at);
  if (!eci) return undefined;
  const look = ecfToLookAngles(
    {
      longitude: degreesToRadians(observer.longitude),
      latitude: degreesToRadians(observer.latitude),
      height: 0,
    },
    eciToEcf(eci, gstime(at)),
  );
  return radiansToDegrees(look.elevation);
}

/**
 * The next pass over a place from `from`, within `hours`, that rises above `minElevationDeg`:
 * sampled every `stepSeconds`, so the times are to within that step. Undefined when none does. A
 * pass already under way at `from` counts, from `from`.
 */
export function nextPass(
  satrec: SatRec,
  observer: { longitude: number; latitude: number },
  from: Date,
  hours = 24,
  minElevationDeg = 10,
  stepSeconds = 30,
): Pass | undefined {
  const end = from.getTime() + hours * 3_600_000;
  let pass: Pass | undefined;
  for (let t = from.getTime(); t <= end; t += stepSeconds * 1000) {
    const at = new Date(t);
    const elevation = elevationFrom(satrec, observer, at);
    if (elevation === undefined) continue;
    if (elevation >= minElevationDeg) {
      if (!pass) pass = { aos: at, tca: at, los: at, maxElevationDeg: elevation };
      if (elevation > pass.maxElevationDeg) {
        pass.maxElevationDeg = elevation;
        pass.tca = at;
      }
      pass.los = at;
    } else if (pass) {
      return pass;
    }
  }
  return pass;
}
