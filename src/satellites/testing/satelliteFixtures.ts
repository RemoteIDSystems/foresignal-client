import type { GpElement, Sensor } from '../satelliteApi';

/** The epoch every stand-in element set is at. */
export const EPOCH = '2026-10-20T00:00:00';

/** An element set with the given name, catalog number and orbit, at {@link EPOCH}. */
export function element(
  name: string,
  norad: number,
  objectId: string,
  orbit: Pick<GpElement, 'MEAN_MOTION' | 'ECCENTRICITY' | 'INCLINATION'> & Partial<GpElement>,
): GpElement {
  return {
    OBJECT_NAME: name,
    OBJECT_ID: objectId,
    EPOCH,
    RA_OF_ASC_NODE: 120,
    ARG_OF_PERICENTER: 90,
    MEAN_ANOMALY: 0,
    NORAD_CAT_ID: norad,
    ELEMENT_SET_NO: 999,
    BSTAR: 0.0002,
    MEAN_MOTION_DOT: 0.0001,
    MEAN_MOTION_DDOT: 0,
    ...orbit,
  };
}

/** An ISS-like low orbit: about 419 km up, over 178.5° W, 51.8° N at the epoch. */
export const ISS = element('ISS (ZARYA)', 25544, '1998-067A', {
  MEAN_MOTION: 15.5,
  ECCENTRICITY: 0.0005,
  INCLINATION: 51.64,
});

/** A sun-synchronous imaging orbit. */
export const SENTINEL = element('SENTINEL-2A', 40697, '2015-028A', {
  MEAN_MOTION: 14.3,
  ECCENTRICITY: 0.0001,
  INCLINATION: 98.57,
});

/** A geostationary weather satellite, about 35,782 km up. */
export const GOES = element('GOES 19', 60133, '2024-119A', {
  MEAN_MOTION: 1.0027,
  ECCENTRICITY: 0.0001,
  INCLINATION: 0.05,
});

/** A medium Earth navigation orbit. */
export const GPS = element('GPS BIIF-1', 36585, '2010-022A', {
  MEAN_MOTION: 2.005,
  ECCENTRICITY: 0.01,
  INCLINATION: 55,
});

/** A highly elliptical orbit. */
export const MOLNIYA = element('MOLNIYA 1-93', 28163, '2004-005A', {
  MEAN_MOTION: 2.006,
  ECCENTRICITY: 0.72,
  INCLINATION: 63.4,
});

/** Element sets SGP4 cannot use: an eccentricity above 1. */
export const BROKEN = element('BROKEN', 99999, '2099-001A', {
  MEAN_MOTION: 15,
  ECCENTRICITY: 1.5,
  INCLINATION: 51,
});

/** Houston, for passes. */
export const HOUSTON = { longitude: -95.37, latitude: 29.76 };

/** The ISS's first pass over Houston after the epoch, above 10°, sampled every 30 s. */
export const ISS_HOUSTON_PASS = {
  aos: '2026-10-20T13:39:00.000Z',
  los: '2026-10-20T13:44:30.000Z',
  maxElevationDeg: 47.6,
};

/** A satellite sensor `listSensors` returns, with one pass and its capabilities. */
export const SENTINEL_SENSOR: Sensor = {
  ref: 'sensor:satellite:40697',
  type: 'sensor',
  title: 'SENTINEL-2A',
  sensorKind: 'satellite',
  passes: [
    {
      aos: '2026-10-21T10:00:00Z',
      tca: '2026-10-21T10:04:00Z',
      los: '2026-10-21T10:09:00Z',
      maxElevationDeg: 62.4,
    },
  ],
  capabilities: { operator: 'ESA', sensorTypes: ['MSI'], resolutionM: 10, swathKm: 290 },
};

/** A ground station in range of the area. */
export const STATION_SENSOR: Sensor = {
  ref: 'sensor:station:satdump-1',
  type: 'sensor',
  title: 'SatDump Houston',
  sensorKind: 'station',
  rangeKm: 2500,
  families: ['weather-imagery'],
};

/** A source observing the area. */
export const SOURCE_SENSOR: Sensor = {
  ref: 'sensor:source:usgs-earthquakes',
  type: 'sensor',
  title: 'USGS Earthquakes',
  sensorKind: 'source',
  pDetect: 1,
  families: ['seismic'],
};
