/** Attribution for everything the client ships: map imagery and open-source packages. */

/** A credited data source shown on the map. */
export interface DataCredit {
  /** What it is. */
  name: string;
  /** Where it is used. */
  use: string;
  /** Who provides it. */
  provider: string;
  /** The page the files were downloaded from. */
  source: string;
}

/**
 * The map's imagery. Both are NASA products downloaded once and served from the client's own
 * origin; `public/basemap/README.md` records the exact files and checksums.
 */
export const DATA_CREDITS: readonly DataCredit[] = [
  {
    name: 'Blue Marble: Next Generation (topography and bathymetry, September 2004)',
    use: 'Map basemap, day side',
    provider: 'NASA Earth Observatory',
    source:
      'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry',
  },
  {
    name: 'Black Marble 2016 (night lights, 3 km)',
    use: 'Map basemap, night side',
    provider: 'NASA Earth Observatory',
    source: 'https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps',
  },
];

/** An open-source package the client ships, with its license as the package declares it. */
export interface PackageCredit {
  /** npm package name. */
  name: string;
  /** SPDX license identifier. */
  license: string;
  /** What the client uses it for. */
  use: string;
}

/**
 * Every runtime dependency in `package.json`. The license is the one in the package's own
 * `package.json`; a test checks both lists against `node_modules`.
 */
export const PACKAGE_CREDITS: readonly PackageCredit[] = [
  { name: 'cesium', license: 'Apache-2.0', use: 'Map and globe engine' },
  { name: 'resium', license: 'MIT', use: 'React bindings for Cesium' },
  { name: 'react', license: 'MIT', use: 'User interface' },
  { name: 'react-dom', license: 'MIT', use: 'User interface' },
  { name: 'react-router', license: 'MIT', use: 'Navigation' },
  { name: 'openapi-fetch', license: 'MIT', use: 'Backend API client' },
  { name: 'lucide-react', license: 'ISC', use: 'Icons' },
  { name: '@fontsource-variable/inter', license: 'OFL-1.1', use: 'Inter typeface' },
];
