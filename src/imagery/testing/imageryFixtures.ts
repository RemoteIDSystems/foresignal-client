import type { Product, RasterFrame } from '../../map/products/productApi';
import type { Sensor } from '../../satellites/satelliteApi';
import type { Media } from '../imageryApi';

/** The instant the fixtures are read at: 2026-10-20 12:00Z. */
export const NOW = Date.parse('2026-10-20T12:00:00Z');

/** The view the fixtures are read over: around Houston, in whole degrees. */
export const AREA = [-96, 29, -94, 31] as const;

/** The attribution GIBS requires, as the backend's catalog gives it (its keys are the backend's). */
const GIBS_ATTRIBUTION = {
  text: 'Imagery: NASA EOSDIS Global Imagery Browse Services (GIBS)',
  licence: 'US-PD',
  requiredDisplay: true,
};

/** A daily external product (VIIRS true color), as the local backend lists it but enabled. */
export const TRUECOLOR: Product = {
  id: 'gibs-viirs-noaa20-truecolor',
  title: 'VIIRS NOAA-20 corrected reflectance true color (GIBS)',
  kind: 'external',
  category: 'imagery',
  source: 'external-catalogue',
  status: { health: 'healthy', stale: false },
  spatial: { bounds: [-180, -85.051129, 180, 85.051129], minZoom: 0, maxZoom: 9 },
  attribution: GIBS_ATTRIBUTION,
  external: {
    provider: 'gibs',
    layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    protocol: 'wmts',
    externalTemplate:
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg',
    tilingScheme: 'GoogleMapsCompatible_Level9',
    tileSize: 256,
    maxNativeZoom: 9,
    format: 'jpg',
    bounds: [-180, -85.051129, 180, 85.051129],
    timeDimension: {
      format: 'YYYY-MM-DD',
      period: 'P1D',
      typicalLatency: 'PT3H',
      defaultLag: 'P1D',
    },
    cors: '*',
    attribution: GIBS_ATTRIBUTION,
  },
};

/** A ten-minute external product (GOES-East band 13 infrared). */
export const BAND13: Product = {
  id: 'gibs-goes-east-band13',
  title: 'GOES-East band 13 clean infrared (GIBS)',
  kind: 'external',
  category: 'satellite',
  source: 'external-catalogue',
  status: { health: 'healthy', stale: false },
  spatial: { bounds: [-180, -85.051129, 180, 85.051129], minZoom: 0, maxZoom: 6 },
  attribution: GIBS_ATTRIBUTION,
  external: {
    provider: 'gibs',
    layer: 'GOES-East_ABI_Band13_Clean_Infrared',
    protocol: 'wmts',
    externalTemplate:
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
    tilingScheme: 'GoogleMapsCompatible_Level6',
    tileSize: 256,
    maxNativeZoom: 6,
    format: 'png',
    bounds: [-180, -85.051129, 180, 85.051129],
    timeDimension: {
      format: 'YYYY-MM-DDThh:mm:ssZ',
      period: 'PT10M',
      typicalLatency: 'PT30M',
      defaultLag: 'PT40M',
    },
    attribution: GIBS_ATTRIBUTION,
  },
};

/** A backend raster product (GOES-East visible). */
export const GOES_VIS: Product = {
  id: 'goes-east-vis',
  title: 'GOES-East visible (ABI band 2)',
  kind: 'raster',
  category: 'satellite',
  source: 'goes-east-abi',
  status: { health: 'healthy', stale: false },
  spatial: { bounds: [-180, -90, 180, 90], minZoom: 0, maxZoom: 8 },
};

/** A product the backend has disabled; imagery leaves it out. */
export const DISABLED: Product = {
  ...GOES_VIS,
  id: 'goes-west-ir',
  title: 'GOES-West clean infrared (ABI band 13)',
  status: { health: 'disabled', stale: true, reason: 'source disabled' },
};

/** A radar product: not imagery. */
export const RADAR: Product = {
  ...GOES_VIS,
  id: 'mrms-reflectivity',
  title: 'MRMS reflectivity',
  category: 'radar',
};

/** A raster frame of {@link GOES_VIS}, with its expanded `/image` template. */
export function frame(time: string, sha = 'abcdef12'): RasterFrame {
  const timeKey = `${time.slice(0, 19).replace(/[-:]/g, '')}Z`;
  return {
    productId: 'goes-east-vis',
    time,
    timeKey,
    frameKey: `${timeKey}~${sha}`,
    status: 'complete',
    tiles: `http://api.test/v1/products/goes-east-vis/tiles/${timeKey}~${sha}/{z}/{x}/{y}.png`,
    image: `http://api.test/v1/products/goes-east-vis/image/${timeKey}~${sha}.png?bbox={bbox}&width={width}&height={height}`,
  };
}

/** A STAC scene acquired over the view. */
export const SCENE: Sensor = {
  ref: 'sensor:scene:S2B_MSIL2A_20261019',
  type: 'sensor',
  title: 'Sentinel-2B MSI L2A',
  sensorKind: 'scene',
  capabilities: { operator: 'ESA', sensorTypes: ['MSI'], resolutionM: 10 },
  acquiredAt: '2026-10-19T16:55:00Z',
  provenance: { sourceIds: ['stac-earth-search'] },
};

/** A media id, as the backend's ULIDs look. */
export const MEDIA_ID = '01JB2W3X4Y5Z6A7B8C9D0E1F2G';

/** A dossier's imagery section with one SatDump product held as media. */
export const DOSSIER_IMAGERY = {
  status: 'ok' as const,
  items: [
    {
      ref: 'record:satdump/noaa19-2026-10-20',
      kind: 'satdump-product' as const,
      title: 'NOAA 19 AVHRR thermal infrared',
      time: '2026-10-20T11:30:00Z',
      sourceId: 'satdump',
      frameUrl: `http://api.test/v1/media/${MEDIA_ID}`,
      thumbnailUrl: `http://api.test/v1/media/${MEDIA_ID}/thumbnail?w=256`,
      bbox: [-100, 25, -90, 35],
    },
  ],
};

/** The stored media row of {@link MEDIA_ID} (its keys are the backend's). */
export const MEDIA: Media = {
  id: MEDIA_ID,
  sha256: 'a'.repeat(64),
  contentType: 'image/png',
  width: 2048,
  height: 1536,
  bytes: 1_234_567,
  role: 'image',
  licence: 'CC-BY-4.0',
  createdAt: '2026-10-20T11:31:00Z',
  expiresAt: null,
};
