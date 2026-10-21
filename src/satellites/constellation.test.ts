import { darkTokens } from '../app/theme';
import {
  buildConstellation,
  CONSTELLATION_SOURCES,
  searchSatellites,
  sourceColors,
} from './constellation';
import { BROKEN, GOES, ISS, SENTINEL } from './testing/satelliteFixtures';

describe('the constellation', () => {
  it('keeps one satellite per catalog number, the first source’s, without unusable element sets', () => {
    const satellites = buildConstellation([
      { source: 'stations', elements: [ISS, BROKEN] },
      { source: 'weather', elements: [GOES, ISS] },
      { source: 'resource', elements: [SENTINEL] },
    ]);
    expect(satellites.map((satellite) => [satellite.norad, satellite.source])).toEqual([
      [25544, 'stations'],
      [60133, 'weather'],
      [40697, 'resource'],
    ]);
    expect(satellites[0]).toMatchObject({ name: 'ISS (ZARYA)', objectId: '1998-067A' });
  });

  it('finds satellites by catalog number, designator or name, exact matches first', () => {
    const satellites = buildConstellation([{ source: 'x', elements: [ISS, SENTINEL, GOES] }]);
    expect(searchSatellites(satellites, '25544').map((satellite) => satellite.name)).toEqual([
      'ISS (ZARYA)',
    ]);
    expect(searchSatellites(satellites, '2015-028a')[0]?.name).toBe('SENTINEL-2A');
    expect(searchSatellites(satellites, 'go').map((satellite) => satellite.name)).toEqual([
      'GOES 19',
    ]);
    expect(searchSatellites(satellites, 'S').map((satellite) => satellite.name)).toEqual([
      'SENTINEL-2A',
      'GOES 19',
      'ISS (ZARYA)',
    ]);
    expect(searchSatellites(satellites, '  ')).toEqual([]);
  });

  it('lists the mock’s data sources in its order, with a color for each one it reads', () => {
    expect(CONSTELLATION_SOURCES.map((source) => source.label)).toEqual([
      'CelesTrak (TLE)',
      'NORAD',
      'Starlink',
      'Planet',
      'Sentinel',
      'GOES',
      'Weather Satellites',
      'Earth Resources',
      'SatDump (Local)',
      'Custom Sources',
    ]);
    const colors = sourceColors(darkTokens);
    for (const source of CONSTELLATION_SOURCES) {
      if (source.selector) expect(colors[source.key]).toMatch(/^#[0-9a-f]{6}$/i);
      else expect(source.unavailable).toBeTruthy();
    }
    expect(
      CONSTELLATION_SOURCES.filter((source) => source.initial).map((source) => source.key),
    ).toEqual(['stations', 'weather', 'resource']);
  });
});
