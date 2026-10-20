// @vitest-environment node
import { matchCountries, parseCoordinates, type ReferenceCountry } from './locate';

describe('parseCoordinates', () => {
  it('reads latitude then longitude, or either order with hemisphere letters', () => {
    expect(parseCoordinates('38.8, -122.7')).toMatchObject({ latitude: 38.8, longitude: -122.7 });
    expect(parseCoordinates('38.8N 122.7W')).toMatchObject({ latitude: 38.8, longitude: -122.7 });
    expect(parseCoordinates('122.7W, 38.8N')).toMatchObject({ latitude: 38.8, longitude: -122.7 });
    expect(parseCoordinates('33.9°S 151.2°E')).toMatchObject({ latitude: -33.9, longitude: 151.2 });
    expect(parseCoordinates('38.8, -122.7')?.label).toBe('38.8000°N, 122.7000°W');
  });

  it('refuses what is not a coordinate pair in range', () => {
    expect(parseCoordinates('Japan')).toBeUndefined();
    expect(parseCoordinates('95, 10')).toBeUndefined();
    expect(parseCoordinates('10, 200')).toBeUndefined();
    expect(parseCoordinates('1 2 3')).toBeUndefined();
  });
});

describe('matchCountries', () => {
  const countries = [
    { iso2: 'JP', iso3: 'JPN', name: 'Japan', labelLon: 138.4, labelLat: 36.2, aliases: [] },
    { iso2: 'NE', iso3: 'NER', name: 'Niger', labelLon: 9.4, labelLat: 17.4, aliases: [] },
    { iso2: 'NG', iso3: 'NGA', name: 'Nigeria', labelLon: 7.5, labelLat: 9.6, aliases: [] },
    {
      iso2: 'GB',
      iso3: 'GBR',
      name: 'United Kingdom',
      labelLon: -2.1,
      labelLat: 53.9,
      aliases: ['Britain'],
    },
  ] as unknown as ReferenceCountry[];

  it('ranks exact names and codes, then names that start with the text, then the rest', () => {
    expect(matchCountries(countries, 'niger').map((target) => target.label)).toEqual([
      'Niger',
      'Nigeria',
    ]);
    expect(matchCountries(countries, 'jp')[0]).toEqual({
      label: 'Japan',
      longitude: 138.4,
      latitude: 36.2,
      iso2: 'JP',
    });
    expect(matchCountries(countries, 'brit')[0]?.label).toBe('United Kingdom');
    expect(matchCountries(countries, 'x')).toEqual([]);
  });
});
