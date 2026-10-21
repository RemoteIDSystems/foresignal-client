import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';
import { dossiersFor } from '../objects/objectApi';
import {
  loadLatestFrame,
  loadProducts,
  parseProductImageUrl,
  type Product,
  type RasterFrame,
} from '../map/products/productApi';
import { listSensors } from '../satellites/satelliteApi';
import {
  COMPARISON_WINDOW_HOURS,
  dossierItem,
  externalFrames,
  externalItem,
  isImageryProduct,
  newestFirst,
  productItem,
  rasterFrames,
  sceneItem,
  type Bbox,
  type ComparisonFrame,
  type ImageryItem,
} from './imageryView';

/** A stored media row (`Media`): its type, size, role, owning record and license. */
export type Media = components['schemas']['Media'];

/** How far back scenes over the view are discovered: `listSensors` takes at most seven days. */
export const SCENE_WINDOW_DAYS = 7;

/** A stored image (`getMedia`), as a blob. */
export async function getMediaBlob(
  api: ForesignalClient,
  mediaId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const { data, response } = await api.GET('/v1/media/{mediaId}', {
    params: { path: { mediaId } },
    parseAs: 'blob',
    headers: { Accept: 'image/*' },
    signal,
  });
  if (!response.ok || !(data instanceof Blob)) throw new Error(`HTTP ${response.status}`);
  return data;
}

/** A stored image's 256 or 1024 px rendition (`getMediaThumbnail`), as a blob. */
export async function getMediaThumbnailBlob(
  api: ForesignalClient,
  mediaId: string,
  width: 256 | 1024,
  signal?: AbortSignal,
): Promise<Blob> {
  const { data, response } = await api.GET('/v1/media/{mediaId}/thumbnail', {
    params: { path: { mediaId }, query: { w: width } },
    parseAs: 'blob',
    headers: { Accept: 'image/*' },
    signal,
  });
  if (!response.ok || !(data instanceof Blob)) throw new Error(`HTTP ${response.status}`);
  return data;
}

/** A stored image's row (`getMediaMeta`). */
export function getMediaMeta(
  api: ForesignalClient,
  mediaId: string,
  signal?: AbortSignal,
): Promise<Media> {
  return unwrap(api.GET('/v1/media/{mediaId}/meta', { params: { path: { mediaId } }, signal }));
}

/** A product frame rendered for a box (`getProductImage`), from its filled `/image` URL, as a blob. */
export async function getProductImageBlob(
  api: ForesignalClient,
  href: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const request = parseProductImageUrl(href);
  if (!request) throw new Error(`Not a product image URL: ${href}`);
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

/** A product's complete frames in a window, newest first (`listProductFrames`). */
export async function listFrames(
  api: ForesignalClient,
  productId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<RasterFrame[]> {
  const page = await unwrap(
    api.GET('/v1/products/{productId}/frames', {
      params: { path: { productId }, query: { from, to, limit: 100 } },
      signal,
    }),
  );
  return [...page.items].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

/** The products that carry imagery and are not disabled, from the catalog (`listProducts`). */
export async function imageryProducts(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<Product[]> {
  return (await loadProducts(api, signal)).filter(isImageryProduct);
}

/** What Recent Imagery lists, and which of its sources did not answer. */
export interface RecentImagery {
  items: ImageryItem[];
  /** One line per source that failed, for the panel to say so. */
  failures: string[];
}

/** What a Recent Imagery read covers. */
export interface RecentImageryQuery {
  /** The view, in whole degrees. */
  area: Bbox;
  /** The selected object, whose dossier imagery comes first, if any. */
  ref?: string;
  /** The instant "now" is, in ms (external products count back from it). */
  now: number;
}

/**
 * Everything Recent Imagery lists over a view, newest first: the selected object's dossier imagery
 * (`getObjectDossier`), each imagery product's newest frame rendered for the view
 * (`getLatestProductFrame`, `getProductImage`), each external imagery product's latest instant
 * (its WMTS template, client-direct), and the STAC scenes over the view in the last week
 * (`listSensors`). A source that fails is named in `failures`; the rest still list. A product with
 * no frame yet (404) is left out silently.
 */
export async function loadRecentImagery(
  api: ForesignalClient,
  query: RecentImageryQuery,
  signal?: AbortSignal,
): Promise<RecentImagery> {
  const failures: string[] = [];
  const failed = (what: string) => (error: unknown) => {
    failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    return [] as ImageryItem[];
  };
  const to = new Date(query.now).toISOString();
  const from = new Date(query.now - SCENE_WINDOW_DAYS * 86_400_000).toISOString();
  const products = imageryProducts(api, signal);
  const [dossier, frames, scenes] = await Promise.all([
    query.ref
      ? dossiersFor(api)
          .load(query.ref, undefined, signal)
          .then(
            (loaded) =>
              loaded.sections.imagery?.status === 'ok'
                ? (loaded.sections.imagery.items ?? []).map(dossierItem)
                : [],
            failed('Selected object'),
          )
      : Promise.resolve([]),
    products.then(async (all) => {
      const items: ImageryItem[] = [];
      await Promise.all(
        all.map(async (product) => {
          if (product.kind === 'external') {
            const item = externalItem(product, query.area, query.now);
            if (item) items.push(item);
            return;
          }
          if (product.kind !== 'raster') return;
          try {
            const frame = await loadLatestFrame(api, product.id, signal);
            items.push(productItem(product, frame, query.area));
          } catch (error) {
            if ((error as { status?: number }).status !== 404) failed(product.title)(error);
          }
        }),
      );
      return items;
    }, failed('Products')),
    listSensors(api, query.area, from, to, ['scene'], signal).then(
      (found) => found.items.filter((item) => item.sensorKind === 'scene').map(sceneItem),
      failed('Scenes'),
    ),
  ]);
  return { items: newestFirst([...dossier, ...frames, ...scenes]), failures };
}

/**
 * The frames a product offers to compare over the view, newest first: an external product's
 * instants (no request; its tiles are client-direct), or a raster product's complete frames in the
 * last {@link COMPARISON_WINDOW_HOURS} (`listProductFrames`) rendered for the view.
 */
export async function loadComparisonFrames(
  api: ForesignalClient,
  product: Product,
  area: Bbox,
  now: number,
  signal?: AbortSignal,
): Promise<ComparisonFrame[]> {
  if (product.kind === 'external') return externalFrames(product, area, now);
  const from = new Date(now - COMPARISON_WINDOW_HOURS * 3_600_000).toISOString();
  const frames = await listFrames(api, product.id, from, new Date(now).toISOString(), signal);
  return rasterFrames(frames, area);
}
