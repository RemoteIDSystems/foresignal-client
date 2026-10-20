// @vitest-environment node
import { LABEL_OVERRIDES, prettifyId } from './labels';

describe('prettifyId', () => {
  it('title-cases words split on hyphens and underscores', () => {
    expect(prettifyId('conflict-event')).toBe('Conflict Event');
    expect(prettifyId('space_weather_alert')).toBe('Space Weather Alert');
    expect(prettifyId('earthquake')).toBe('Earthquake');
  });

  it('spells acronyms and product names as their owners do', () => {
    expect(prettifyId('aprs-station')).toBe('APRS Station');
    expect(prettifyId('ais-gap')).toBe('AIS Gap');
    expect(prettifyId('adsb-mil')).toBe('ADS-B Mil');
    expect(prettifyId('rf-sigint-uav')).toBe('RF SIGINT UAV');
    expect(prettifyId('shakemap-mmi')).toBe('ShakeMap MMI');
    expect(prettifyId('malware-url')).toBe('Malware URL');
    expect(prettifyId('chokepoint-uturn')).toBe('Chokepoint U-Turn');
    expect(prettifyId('xray-current')).toBe('X-Ray Current');
  });

  it('keeps minor words lowercase except at the start', () => {
    expect(prettifyId('rate-of-change')).toBe('Rate of Change');
    expect(prettifyId('of-interest')).toBe('Of Interest');
  });

  it('uses an override where the rules read wrong, whatever the case of the id', () => {
    expect(prettifyId('cpa')).toBe('Closest Point of Approach');
    expect(prettifyId('pol-deviation')).toBe('Pattern-of-Life Deviation');
    expect(prettifyId('AERODROME-OSM')).toBe('Aerodrome (OSM)');
    // A backend id with a British spelling keeps it; only the label is US English.
    expect(prettifyId('data-centre-osm')).toBe('Data Center (OSM)');
    for (const id of Object.keys(LABEL_OVERRIDES)) expect(id).toBe(id.toLowerCase());
  });

  it('gives an empty label for an empty id', () => {
    expect(prettifyId('')).toBe('');
    expect(prettifyId('--')).toBe('');
  });
});
