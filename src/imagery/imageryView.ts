import type { Dossier } from '../objects/objectApi';
import type { Product, RasterFrame } from '../map/products/productApi';
import type { Sensor } from '../satellites/satelliteApi';

/** A west, south, east, north box in degrees. */
export type Bbox = readonly [number, number, number, number];

/** The imagery bands the Recent Imagery filters know. */
export type ImageryBand = 'optical' | 'sar' | 'thermal';

/** One of the Recent Imagery filters, as the mock lists them. */
export type ImageryFilter = 'all' | ImageryBand | 'change';

/** The Recent Imagery filters, in the mock's order. */
export const IMAGERY_FILTERS: readonly { key: ImageryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'optical', label: 'Optical' },
  { key: 'sar', label: 'SAR' },
  { key: 'thermal', label: 'Thermal' },
  { key: 'change', label: 'Change Detection' },
];

/** The label of a band, as an item's caption shows it. */
export const BAND_LABELS: Readonly<Record<ImageryBand, string>> = {
  optical: 'Optical',
  sar: 'SAR',
  thermal: 'Thermal',
};

/** Why the Change Detection filter and the run action are empty: the backend has no such operation. */
export const NO_CHANGE_DETECTION =
  'The backend exposes no change-detection operation, so there are no change results to list.';

/**
 * How a picture is fetched: a stored media item (`getMedia`, `getMediaThumbnail`), a product frame
 * rendered for a box (`getProductImage`), a URL the backend gave as is, a mosaic of an external
 * product's WMTS tiles (client-direct, as the backend's catalog says), or nothing to show.
 */
export type ImageSpec =
  | { type: 'media'; mediaId: string }
  | { type: 'product-image'; href: string }
  | { type: 'url'; url: string }
  | {
      type: 'tiles';
      template: string;
      time: string;
      z: number;
      longitude: number;
      latitude: number;
    }
  | { type: 'none' };

/** One entry of the Recent Imagery grid, from wherever it came. */
export interface ImageryItem {
  /** Unique within a list. */
  key: string;
  /** The satellite, sensor or product. */
  title: string;
  /** The source id or provider. */
  source: string;
  /** When it was observed (ISO), if known. */
  time: string | undefined;
  /** Resolution as the caption shows it, or `—`. */
  resolution: string;
  /** Its band, when its name says; undefined lists it under All only. */
  band: ImageryBand | undefined;
  /** Whether it comes from a satellite product (the Global panel's Satellite tab). */
  satellite: boolean;
  /** Where it came from: a product frame, an external product, a scene over the view, or a dossier. */
  origin: 'product' | 'external' | 'scene' | 'dossier';
  /** The small picture. */
  thumb: ImageSpec;
  /** The full frame. */
  full: ImageSpec;
  /** The object it opens, if it is one. */
  ref?: string;
  /** Attribution the provider requires to be shown, if any. */
  attribution?: string;
}

/** The band a name points at, if any (`infrared` is thermal, `true color` optical, and so on). */
export function bandOf(text: string): ImageryBand | undefined {
  if (/\bsar\b|sentinel-1|radar ?sat|synthetic aperture/i.test(text)) return 'sar';
  if (
    /infra-?red|\bir\b|band ?13|thermal|temperature|firetemp|\bsst\b|\btir\b|\blwir\b/i.test(text)
  )
    return 'thermal';
  if (
    /visible|true ?colou?r|geocolou?r|reflectance|band ?2\b|\bvis\b|optical|\bmsi\b|\bpan\b|multispectral|black marble/i.test(
      text,
    )
  )
    return 'optical';
  return undefined;
}

/** Whether an item passes a filter. Change Detection matches nothing: there are no results to list. */
export function matchesFilter(item: ImageryItem, filter: ImageryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'change') return false;
  return item.band === filter;
}

/** Newest first; items without a time last, then by title. */
export function newestFirst(items: readonly ImageryItem[]): ImageryItem[] {
  return [...items].sort((a, b) => {
    const at = a.time ? Date.parse(a.time) : -Infinity;
    const bt = b.time ? Date.parse(b.time) : -Infinity;
    return bt - at || a.title.localeCompare(b.title);
  });
}

/** A view's box widened to whole degrees, so a small pan does not read again; the world without one. */
export function viewArea(bbox: readonly number[] | undefined): Bbox {
  if (!bbox || bbox.length !== 4) return [-180, -90, 180, 90];
  const [west, south, east, north] = bbox as [number, number, number, number];
  return [
    Math.max(-180, Math.floor(west)),
    Math.max(-90, Math.floor(south)),
    Math.min(180, Math.ceil(east)),
    Math.min(90, Math.ceil(north)),
  ];
}

/** The middle of a box; across the antimeridian it wraps. */
export function middleOf(area: Bbox): { longitude: number; latitude: number } {
  const [west, south, east, north] = area;
  const span = east >= west ? east - west : east + 360 - west;
  let longitude = west + span / 2;
  if (longitude > 180) longitude -= 360;
  return { longitude, latitude: (south + north) / 2 };
}

/** Milliseconds in an ISO-8601 duration of days, hours, minutes and seconds (`P1D`, `PT10M`). */
export function durationMs(duration: string | null | undefined): number | undefined {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration ?? '');
  if (!match || duration === 'P' || duration === 'PT') return undefined;
  const [, d = '0', h = '0', m = '0', s = '0'] = match;
  const ms = ((Number(d) * 24 + Number(h)) * 60 + Number(m)) * 60_000 + Number(s) * 1000;
  return ms > 0 ? ms : undefined;
}

/** The external part of a product, as the catalog gives it. */
type External = NonNullable<Product['external']>;

/** An instant in an external product's time format (`YYYY-MM-DD`, or to the second in UTC). */
export function externalTime(format: string | null | undefined, at: number): string {
  const iso = new Date(at).toISOString();
  return format === 'YYYY-MM-DD' ? iso.slice(0, 10) : `${iso.slice(0, 19)}Z`;
}

/**
 * The instants of an external product to offer, newest first: its default lag behind `now`,
 * floored to its period, then back a step at a time (a step is at least an hour, so a ten-minute
 * product offers hours, not minutes). Empty for a product without a time dimension.
 */
export function externalInstants(external: External, now: number, count: number): number[] {
  const dimension = external.timeDimension;
  const period = durationMs(dimension?.period);
  if (!dimension || !period) return [];
  const lag = durationMs(dimension.defaultLag) ?? period;
  const latest = Math.floor((now - lag) / period) * period;
  const step = Math.max(period, Math.ceil(3_600_000 / period) * period);
  return Array.from({ length: count }, (_, index) => latest - index * step);
}

/** Meters a pixel covers at the equator at a Web Mercator zoom. */
export function metersPerPixel(zoom: number): number {
  return 156_543.03392 / 2 ** zoom;
}

/** A resolution in meters as captions show it: `0.31 m`, `10 m`, `2.4 km`. */
export function resolutionText(meters: number | null | undefined, approximate = false): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  const text =
    meters >= 1000
      ? `${Number((meters / 1000).toFixed(1))} km`
      : meters >= 10
        ? `${Math.round(meters)} m`
        : `${Number(meters.toFixed(2))} m`;
  return approximate ? `≈ ${text}` : text;
}

/** The Web Mercator tile holding a point at a zoom. */
export function tileOf(longitude: number, latitude: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const lat = (Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI) / 180;
  const x = Math.floor(((longitude + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
  return { x: ((x % n) + n) % n, y: Math.max(0, Math.min(n - 1, y)) };
}

/** One tile of an external WMTS template. */
export function externalTileUrl(
  template: string,
  time: string,
  tile: { z: number; x: number; y: number },
): string {
  return template
    .replace('{time}', time)
    .replace('{z}', String(tile.z))
    .replace('{y}', String(tile.y))
    .replace('{x}', String(tile.x));
}

/**
 * The tiles of a mosaic `size` tiles square around a point, row by row: columns wrap around the
 * world, and rows are kept inside it.
 */
export function mosaicUrls(spec: Extract<ImageSpec, { type: 'tiles' }>, size: number): string[][] {
  const n = 2 ** spec.z;
  const center = tileOf(spec.longitude, spec.latitude, spec.z);
  const half = Math.floor(size / 2);
  const top = Math.max(0, Math.min(Math.max(0, n - size), center.y - half));
  const rows: string[][] = [];
  for (let row = 0; row < Math.min(size, n); row++) {
    const cells: string[] = [];
    for (let column = 0; column < Math.min(size, n); column++) {
      const x = (((center.x - half + column) % n) + n) % n;
      cells.push(externalTileUrl(spec.template, spec.time, { z: spec.z, x, y: top + row }));
    }
    rows.push(cells);
  }
  return rows;
}

/** Fills a frame's `/image` template for a box and size. */
export function frameImageHref(
  template: string,
  area: Bbox,
  width: number,
  height: number,
): string {
  return template
    .replace('{bbox}', area.join(','))
    .replace('{width}', String(width))
    .replace('{height}', String(height));
}

/** The id in a `/v1/media/{id}…` URL, if it is one. */
export function mediaIdOf(url: string | null | undefined): string | undefined {
  return /\/v1\/media\/([0-9A-HJKMNP-TV-Z]{26})(?:[/?#]|$)/.exec(url ?? '')?.[1];
}

/** How a URL the backend gave is fetched: a media id through the client, else as is. */
export function specOfUrl(url: string | null | undefined): ImageSpec {
  if (!url) return { type: 'none' };
  const mediaId = mediaIdOf(url);
  return mediaId ? { type: 'media', mediaId } : { type: 'url', url };
}

/** Whether a product carries imagery: a satellite or imagery product the backend has not disabled. */
export function isImageryProduct(product: Product): boolean {
  return (
    (product.category === 'satellite' || product.category === 'imagery') &&
    product.status?.health !== 'disabled'
  );
}

/** Thumbnails are this many pixels wide, and full frames this many. */
export const THUMB_SIZE = { width: 256, height: 160 } as const;
export const FULL_SIZE = { width: 1024, height: 640 } as const;

/** The zoom of an external product's thumbnail tile, and of its full mosaic. */
const THUMB_ZOOM = 5;
const FULL_ZOOM = 7;

/** The name a product's band is read from. */
function productText(product: Product): string {
  return `${product.id} ${product.title} ${product.external?.layer ?? ''}`;
}

/** A raster product's newest frame over the view, as an item. */
export function productItem(product: Product, frame: RasterFrame, area: Bbox): ImageryItem {
  const image = frame.image;
  return {
    key: `product:${product.id}:${frame.frameKey}`,
    title: product.title,
    source: product.source ?? product.id,
    time: frame.time,
    resolution: '—',
    band: bandOf(productText(product)),
    satellite: product.category === 'satellite',
    origin: 'product',
    thumb: image
      ? {
          type: 'product-image',
          href: frameImageHref(image, area, THUMB_SIZE.width, THUMB_SIZE.height),
        }
      : { type: 'none' },
    full: image
      ? {
          type: 'product-image',
          href: frameImageHref(image, area, FULL_SIZE.width, FULL_SIZE.height),
        }
      : { type: 'none' },
    ...(product.attribution?.requiredDisplay && { attribution: product.attribution.text }),
  };
}

/** An external product's latest instant over the view's middle, as an item; undefined without one. */
export function externalItem(product: Product, area: Bbox, now: number): ImageryItem | undefined {
  const external = product.external;
  const [latest] = external ? externalInstants(external, now, 1) : [];
  if (!external?.externalTemplate || latest === undefined) return undefined;
  const time = externalTime(external.timeDimension?.format, latest);
  const center = middleOf(area);
  const native = external.maxNativeZoom ?? product.spatial?.maxZoom;
  const tiles = (z: number) =>
    ({
      type: 'tiles',
      template: external.externalTemplate!,
      time,
      z: native != null ? Math.min(native, z) : z,
      ...center,
    }) as const;
  return {
    key: `external:${product.id}:${time}`,
    title: product.title,
    source: external.provider ?? product.source ?? product.id,
    time: new Date(latest).toISOString(),
    resolution: native != null ? resolutionText(metersPerPixel(native), true) : '—',
    band: bandOf(productText(product)),
    satellite: product.category === 'satellite',
    origin: 'external',
    thumb: tiles(THUMB_ZOOM),
    full: tiles(FULL_ZOOM),
    ...((external.attribution?.requiredDisplay ?? product.attribution?.requiredDisplay) && {
      attribution: external.attribution?.text ?? product.attribution?.text,
    }),
  };
}

/** A STAC scene over the view (`listSensors` kind `scene`), as an item; it has no picture. */
export function sceneItem(scene: Sensor): ImageryItem {
  const types = scene.capabilities?.sensorTypes ?? [];
  return {
    key: `scene:${scene.ref}`,
    title: scene.title,
    source: scene.capabilities?.operator ?? scene.provenance?.sourceIds?.[0] ?? 'STAC',
    time: scene.acquiredAt ?? scene.time?.observedAt ?? scene.time?.start ?? undefined,
    resolution: resolutionText(scene.capabilities?.resolutionM),
    band: bandOf(`${scene.title} ${types.join(' ')}`),
    satellite: true,
    origin: 'scene',
    thumb: { type: 'none' },
    full: { type: 'none' },
    ref: scene.ref,
  };
}

/** One entry of a dossier's imagery section. */
export type DossierImage = NonNullable<
  NonNullable<Dossier['sections']['imagery']>['items']
>[number];

/** A dossier's imagery entry (`getObjectDossier` section `imagery`), as an item. */
export function dossierItem(image: DossierImage): ImageryItem {
  const thumb = specOfUrl(image.thumbnailUrl ?? image.frameUrl);
  const full = image.frameUrl ? specOfUrl(image.frameUrl) : thumb;
  return {
    key: `dossier:${image.ref}`,
    title: image.title ?? image.kind,
    source: image.sourceId ?? image.kind,
    time: image.time ?? undefined,
    resolution: '—',
    band: bandOf(`${image.title ?? ''} ${image.sourceId ?? ''}`),
    // SatDump products and STAC scenes are satellite imagery; a raster frame is when its source says.
    satellite:
      image.kind !== 'raster-frame' || /goes|satellite|viirs|modis/i.test(image.sourceId ?? ''),
    origin: 'dossier',
    thumb,
    full,
    ref: image.ref,
  };
}

/** An item's caption under its thumbnail: resolution and band, as the mock writes `0.31 m · Optical`. */
export function captionOf(item: ImageryItem): string {
  return [item.resolution, item.band ? BAND_LABELS[item.band] : undefined]
    .filter((part) => part && part !== '—')
    .join(' · ');
}

/** One dated frame the comparison can show on either side of the swipe. */
export interface ComparisonFrame {
  /** Its instant (ISO). */
  time: string;
  /** The picture, at full size. */
  spec: ImageSpec;
}

/** How many instants an external product offers to compare. */
export const COMPARISON_INSTANTS = 30;

/** How far back a backend product's frames are listed to compare. */
export const COMPARISON_WINDOW_HOURS = 72;

/** Whether a product can be compared: an external with a template and time, or a raster product. */
export function isComparable(product: Product): boolean {
  if (product.kind === 'raster') return true;
  return (
    product.kind === 'external' &&
    !!product.external?.externalTemplate &&
    durationMs(product.external.timeDimension?.period) !== undefined
  );
}

/** An external product's instants as comparison frames over the view's middle, newest first. */
export function externalFrames(product: Product, area: Bbox, now: number): ComparisonFrame[] {
  const external = product.external;
  if (!external?.externalTemplate) return [];
  const center = middleOf(area);
  const native = external.maxNativeZoom ?? product.spatial?.maxZoom;
  const z = native != null ? Math.min(native, FULL_ZOOM) : FULL_ZOOM;
  return externalInstants(external, now, COMPARISON_INSTANTS).map((at) => ({
    time: new Date(at).toISOString(),
    spec: {
      type: 'tiles',
      template: external.externalTemplate!,
      time: externalTime(external.timeDimension?.format, at),
      z,
      ...center,
    },
  }));
}

/** A raster product's frames as comparison frames rendered for the view, newest first. */
export function rasterFrames(frames: readonly RasterFrame[], area: Bbox): ComparisonFrame[] {
  return frames
    .filter((frame) => frame.image)
    .map((frame) => ({
      time: frame.time,
      spec: {
        type: 'product-image',
        href: frameImageHref(frame.image!, area, FULL_SIZE.width, FULL_SIZE.height),
      },
    }));
}

/**
 * The pair the comparison opens with: the newest frame after, and before it a week back for a
 * daily product (the frame seven steps on), else the oldest offered. Undefined with fewer than two.
 */
export function defaultPair(
  frames: readonly ComparisonFrame[],
  product: Product | undefined,
): { before: string; after: string } | undefined {
  if (frames.length < 2) return undefined;
  const daily = durationMs(product?.external?.timeDimension?.period) === 86_400_000;
  const before = (daily && frames[7]) || frames[frames.length - 1]!;
  return { before: before.time, after: frames[0]!.time };
}

/** The mock's change metrics; the backend supplies none, so each reads `—`. */
export const CHANGE_METRICS: readonly { label: string; value: string }[] = [
  { label: 'Building count', value: '—' },
  { label: 'Disturbed area', value: '—' },
  { label: 'Confidence', value: '—' },
];

/** A comparison label: the day for a daily frame, else the minute in UTC. */
export function frameLabel(time: string, daily: boolean): string {
  return daily ? time.slice(0, 10) : `${time.slice(0, 16).replace('T', ' ')}Z`;
}

/** The Global panel's imagery tabs: everything, satellite imagery, video, and scenes over the view. */
export type GlobalImageryTab = 'recent' | 'video' | 'satellite' | 'area';

/** What the Video tab says: the backend's media are images, documents and audio. */
export const NO_VIDEO =
  'The backend stores no video: its media are images, CZML documents and briefing audio.';

/** The items a Global imagery tab lists; Video lists none. */
export function imageryForTab(items: readonly ImageryItem[], tab: GlobalImageryTab): ImageryItem[] {
  if (tab === 'video') return [];
  if (tab === 'satellite') return items.filter((item) => item.satellite);
  if (tab === 'area') return items.filter((item) => item.origin === 'scene');
  return [...items];
}
