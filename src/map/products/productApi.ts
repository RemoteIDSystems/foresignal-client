import { unwrap, type ForesignalClient } from '../../api/client';
import type { components } from '../../api/generated/schema';
import { items } from '../../api/paging';
import type { CommittedViewport } from '../../state/viewport';

/** One product of the catalog (`listProducts`). */
export type Product = components['schemas']['Product'];
/** One frame of a product, with its expanded tile template (`getLatestProductFrame`). */
export type RasterFrame = components['schemas']['RasterFrame'];
/** An animation loop over one snapped box (`getProductLoop`). */
export type ProductLoop = components['schemas']['ProductLoop'];
/** One frame of a {@link ProductLoop}. */
export type LoopFrame = ProductLoop['frames'][number];
/** A product's JSON legend (`getProductLegend`). */
export type ProductLegend = components['schemas']['Legend'];
/** A wind field's manifest (`getProductFieldManifest`). */
export type FieldManifest = components['schemas']['FieldManifest'];

/** Frame keys that name no fixed frame; a template must never carry one. */
const ALIASES = new Set(['latest', 'now']);

/** A product tile template, reduced to what `getProductTile` takes. */
export interface ProductTileTemplate {
  productId: string;
  /** The concrete, content-addressed frame key (`{timeKey}~{sha8}`). */
  frameKey: string;
  /** The template's `style` and `run`. */
  query: { style?: string; run?: string };
}

const TILE_PATH = /\/v1\/products\/([^/]+)\/tiles\/([^/]+)\/\{z\}\/\{x\}\/\{y\}\.png$/;

/**
 * Reads a frame's expanded tile template (`…/v1/products/{id}/tiles/{frameKey}/{z}/{x}/{y}.png
 * ?style=…`) into the `getProductTile` path and query. The host is ignored: tiles go through the
 * API client, to its own backend with its credentials. Returns undefined for a template of another
 * shape, or one whose frame key is an alias such as `latest`: such a URL would change under a
 * cached tile.
 */
export function parseProductTileTemplate(template: string): ProductTileTemplate | undefined {
  const url = parseUrl(template);
  const match = url && TILE_PATH.exec(decodeURI(url.pathname));
  if (!url || !match) return undefined;
  const frameKey = decodeURIComponent(match[2]!);
  if (ALIASES.has(frameKey.toLowerCase())) return undefined;
  return {
    productId: decodeURIComponent(match[1]!),
    frameKey,
    query: pick(url.searchParams, ['style', 'run']),
  };
}

/** A loop frame's `/image` URL, reduced to what `getProductImage` takes. */
export interface ProductImageRequest {
  productId: string;
  frameKey: string;
  format: 'png' | 'jpg' | 'webp';
  query: {
    bbox: string;
    width?: number;
    height?: number;
    crs?: 'EPSG:3857' | 'EPSG:4326';
    style?: string;
    run?: string;
  };
}

const IMAGE_PATH = /\/v1\/products\/([^/]+)\/image\/(.+)\.(png|jpg|webp)$/;

/**
 * Reads a loop frame's expanded `/image` URL into the `getProductImage` path and query, so the
 * image is fetched through the API client. Returns undefined for another shape, a missing `bbox`,
 * or an alias frame key.
 */
export function parseProductImageUrl(href: string): ProductImageRequest | undefined {
  const url = parseUrl(href);
  const match = url && IMAGE_PATH.exec(decodeURI(url.pathname));
  const bbox = url?.searchParams.get('bbox');
  if (!url || !match || !bbox) return undefined;
  const frameKey = decodeURIComponent(match[2]!);
  if (ALIASES.has(frameKey.toLowerCase())) return undefined;
  const query: ProductImageRequest['query'] = { bbox, ...pick(url.searchParams, ['style', 'run']) };
  const width = Number(url.searchParams.get('width'));
  const height = Number(url.searchParams.get('height'));
  if (width > 0) query.width = width;
  if (height > 0) query.height = height;
  const crs = url.searchParams.get('crs');
  if (crs === 'EPSG:3857' || crs === 'EPSG:4326') query.crs = crs;
  return {
    productId: decodeURIComponent(match[1]!),
    frameKey,
    format: match[3] as ProductImageRequest['format'],
    query,
  };
}

/** A wind field's png-uv URL from its manifest, reduced to what `getProductFieldPngUv` takes. */
export interface FieldPngRequest {
  productId: string;
  frameKey: string;
  query: { run?: string; res?: 1 | 0.25; bbox?: string };
}

const PNG_UV_PATH = /\/v1\/products\/([^/]+)\/fields\/(.+)\.png-uv$/;

/** Reads a manifest's `encodings.pngUv.url` into the `getProductFieldPngUv` path and query. */
export function parseFieldPngUrl(href: string): FieldPngRequest | undefined {
  const url = parseUrl(href);
  const match = url && PNG_UV_PATH.exec(decodeURI(url.pathname));
  if (!url || !match) return undefined;
  const query: FieldPngRequest['query'] = pick(url.searchParams, ['run', 'bbox']);
  const res = url.searchParams.get('res');
  if (res === '1' || res === '0.25') query.res = Number(res) as 1 | 0.25;
  return {
    productId: decodeURIComponent(match[1]!),
    frameKey: decodeURIComponent(match[2]!),
    query,
  };
}

/** Every product in the catalog, all pages (`listProducts`). */
export async function loadProducts(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<Product[]> {
  const all: Product[] = [];
  for await (const product of items((cursor) =>
    unwrap(api.GET('/v1/products', { params: { query: { limit: 500, cursor } }, signal })),
  )) {
    all.push(product);
  }
  return all;
}

/**
 * A product's newest complete frame (`getLatestProductFrame`): the alias is resolved here, once,
 * and the map draws the concrete frame it names. Throws an `FsError` (404 UNKNOWN_FRAME when the
 * product has no frame yet).
 */
export function loadLatestFrame(
  api: ForesignalClient,
  productId: string,
  signal?: AbortSignal,
): Promise<RasterFrame> {
  return unwrap(
    api.GET('/v1/products/{productId}/frames/latest', {
      params: { path: { productId } },
      signal,
    }),
  );
}

/** A product's JSON legend in metric units (`getProductLegend`), in its default style. */
export function loadLegend(
  api: ForesignalClient,
  productId: string,
  signal?: AbortSignal,
): Promise<ProductLegend> {
  return unwrap(
    api.GET('/v1/products/{productId}/legend', {
      params: { path: { productId }, query: { units: 'metric' } },
      signal,
    }),
  );
}

/** Most frames a loop asks for (the backend's own limit). */
export const LOOP_FRAMES = 24;
/** Widest loop image, in pixels (the backend's own limit). */
export const LOOP_MAX_WIDTH = 1024;

/**
 * An animation loop of one product over the committed viewport (`getProductLoop`), at most
 * {@link LOOP_FRAMES} frames and `width` pixels wide. A view across the antimeridian is asked
 * about up to the antimeridian: the backend reads such a box as the band between its edges.
 */
export function loadLoop(
  api: ForesignalClient,
  productId: string,
  viewport: CommittedViewport,
  width: number,
  signal?: AbortSignal,
): Promise<ProductLoop> {
  const [west, south, east, north] = viewport.bbox;
  const bbox = [west, south, west > east ? 180 : east, north].join(',');
  return unwrap(
    api.GET('/v1/products/loop', {
      params: {
        query: {
          products: [productId],
          bbox,
          frames: LOOP_FRAMES,
          width: Math.max(64, Math.min(LOOP_MAX_WIDTH, Math.round(width))),
        },
      },
      signal,
    }),
  );
}

/** The loop frames still retained at `now`: a frame past its `expiresAt` is dropped. */
export function liveFrames(frames: readonly LoopFrame[], now: number): LoopFrame[] {
  return frames.filter((frame) => !frame.expiresAt || Date.parse(frame.expiresAt) > now);
}

/** Fetches a loop frame's image through the API client, as a blob. */
export async function fetchLoopImage(
  api: ForesignalClient,
  frame: LoopFrame,
  signal?: AbortSignal,
): Promise<Blob> {
  const request = parseProductImageUrl(frame.url);
  if (!request) throw new Error(`Not a product image URL: ${frame.url}`);
  const { data, response } = await api.GET('/v1/products/{productId}/image/{frameKey}.{format}', {
    params: {
      path: { productId: request.productId, frameKey: request.frameKey, format: request.format },
      query: request.query,
    },
    parseAs: 'blob',
    headers: { Accept: 'image/*' },
    signal,
  });
  if (!response.ok || !(data instanceof Blob)) throw new Error(`HTTP ${response.status}`);
  return data;
}

/**
 * Fetches one product tile (`getProductTile`) through the API client, which adds credentials and
 * retries 429 and 503 RENDER_BUSY per `Retry-After` (002). Throws on any other failure.
 */
export async function fetchProductTile(
  api: ForesignalClient,
  template: ProductTileTemplate,
  tile: { z: number; x: number; y: number },
  signal?: AbortSignal,
): Promise<Blob> {
  const { data, response } = await api.GET(
    '/v1/products/{productId}/tiles/{frameKey}/{z}/{x}/{y}.png',
    {
      params: {
        path: {
          productId: template.productId,
          frameKey: template.frameKey,
          z: tile.z,
          x: tile.x,
          y: String(tile.y),
        },
        query: template.query,
      },
      parseAs: 'blob',
      headers: { Accept: 'image/png' },
      signal,
    },
  );
  if (!response.ok || !(data instanceof Blob)) throw new Error(`HTTP ${response.status}`);
  return data;
}

/**
 * Fetches one wind vector tile (`getProductVectorTile`, layer `wind`) for a frame. An empty body
 * is an empty tile. Throws on failure.
 */
export async function fetchWindTile(
  api: ForesignalClient,
  frame: Pick<RasterFrame, 'productId' | 'frameKey' | 'run'>,
  tile: { z: number; x: number; y: number },
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const { data, response } = await api.GET(
    '/v1/products/{productId}/vectors/{frameKey}/{z}/{x}/{y}.mvt',
    {
      params: {
        path: { productId: frame.productId, frameKey: frame.frameKey, ...tile },
        query: frame.run ? { run: frame.run } : {},
      },
      parseAs: 'arrayBuffer',
      headers: { Accept: 'application/vnd.mapbox-vector-tile' },
      signal,
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (data as ArrayBuffer | undefined) ?? new ArrayBuffer(0);
}

/** A frame's wind-field manifest (`getProductFieldManifest`), its run pinned to the frame's. */
export function loadFieldManifest(
  api: ForesignalClient,
  frame: Pick<RasterFrame, 'productId' | 'frameKey' | 'run'>,
  signal?: AbortSignal,
): Promise<FieldManifest> {
  return unwrap(
    api.GET('/v1/products/{productId}/fields/{frameKey}.json', {
      params: {
        path: { productId: frame.productId, frameKey: frame.frameKey },
        query: frame.run ? { run: frame.run } : {},
      },
      signal,
    }),
  );
}

/** Fetches the png-uv encoding a manifest names (`getProductFieldPngUv`), as a blob. */
export async function fetchFieldPng(
  api: ForesignalClient,
  href: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const request = parseFieldPngUrl(href);
  if (!request) throw new Error(`Not a png-uv URL: ${href}`);
  const { data, response } = await api.GET('/v1/products/{productId}/fields/{frameKey}.png-uv', {
    params: {
      path: { productId: request.productId, frameKey: request.frameKey },
      query: request.query,
    },
    parseAs: 'blob',
    headers: { Accept: 'image/png' },
    signal,
  });
  if (!response.ok || !(data instanceof Blob)) throw new Error(`HTTP ${response.status}`);
  return data;
}

/**
 * How often to look for a product's next frame: half its cadence (`5m`, `1h`, `1d`), at most a
 * minute, as the backend's own `latest` max-age; a minute when the cadence is unknown.
 */
export function pollInterval(cadence: string | null | undefined): number {
  const match = /^(\d+(?:\.\d+)?)\s*([smhd])$/.exec(cadence ?? '');
  if (!match) return 60_000;
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's'];
  return Math.max(5_000, Math.min(60_000, (Number(match[1]) * unit) / 2));
}

/** A URL relative to any host, or undefined when it does not parse. */
function parseUrl(href: string): URL | undefined {
  try {
    return new URL(href, 'http://template.invalid');
  } catch {
    return undefined;
  }
}

/** The named search parameters that are present. */
function pick<K extends string>(
  params: URLSearchParams,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) out[key] = value;
  }
  return out;
}
