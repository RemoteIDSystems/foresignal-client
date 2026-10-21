import type { CategoryId } from '../../lib/kindCategories';
import {
  DEFAULT_PRODUCTS,
  PRODUCT_RAIL_CATEGORY,
  type ProductCategory,
} from '../../lib/productCategories';
import type { Product } from './productApi';
import { productLayerKey, type ProductFacet } from './productLayers';

/** A product as the rail lists it. */
export interface ProductEntry {
  id: string;
  /** The backend's title. */
  label: string;
  /** Its own category (radar, satellite, …). */
  productCategory: ProductCategory;
  /** The rail category it is listed under. */
  category: CategoryId;
  /** True for a wind field (`kind: field`), which can also be drawn as barbs and particles. */
  field: boolean;
  /** False when it cannot be drawn now (disabled); `reason` says why. */
  available: boolean;
  reason?: string;
  /** Its coverage (`global`, `CONUS`, …). */
  coverage?: string;
  /** What the product means, for the row's tooltip. */
  summary?: string;
}

/**
 * The products the rail lists, sorted by category then title. External products (drawn by the
 * client straight from a third party's tiles) are left out: the map draws only what the backend
 * serves. A product whose health is `disabled` is listed but cannot be turned on.
 */
export function productEntries(products: readonly Product[]): ProductEntry[] {
  const order = Object.keys(PRODUCT_RAIL_CATEGORY);
  return products
    .filter((product) => product.kind !== 'external')
    .map((product): ProductEntry => {
      const productCategory = product.category as ProductCategory;
      const available = product.status?.health !== 'disabled';
      return {
        id: product.id,
        label: product.title,
        productCategory,
        category: PRODUCT_RAIL_CATEGORY[productCategory] ?? 'weather',
        field: product.kind === 'field',
        available,
        reason: available ? undefined : (product.status?.reason ?? 'disabled'),
        coverage: product.coverage ?? undefined,
        summary: product.legend?.summary ?? product.coverageMeaning ?? undefined,
      };
    })
    .sort(
      (a, b) =>
        order.indexOf(a.productCategory) - order.indexOf(b.productCategory) ||
        a.label.localeCompare(b.label, 'en'),
    );
}

/** The facets a product row offers: the raster alone, or a wind field's speed, barbs and particles. */
export function productFacets(entry: Pick<ProductEntry, 'field'>): ProductFacet[] {
  return entry.field ? ['raster', 'barbs', 'particles'] : ['raster'];
}

/** The facets a wind field turns on with its row's checkbox: the speed raster and particles. */
export const DEFAULT_FIELD_FACETS: readonly ProductFacet[] = ['raster', 'particles'];

/** The layer keys a product row's checkbox turns on. */
export function rowKeys(entry: Pick<ProductEntry, 'id' | 'field'>): string[] {
  const facets = entry.field ? DEFAULT_FIELD_FACETS : (['raster'] as const);
  return facets.map((facet) => productLayerKey(entry.id, facet));
}

/** Every layer key of a product, whichever facets it has. */
export function allKeys(entry: Pick<ProductEntry, 'id' | 'field'>): string[] {
  return productFacets(entry).map((facet) => productLayerKey(entry.id, facet));
}

/** The product layers on when the dashboard opens: the curated defaults that can be drawn. */
export function defaultProductLayers(entries: readonly ProductEntry[]): string[] {
  return entries
    .filter((entry) => entry.available && DEFAULT_PRODUCTS.includes(entry.id))
    .flatMap(rowKeys);
}

/** The curated products of a rail category that can be drawn, as layer keys. */
export function categoryDefaultKeys(
  entries: readonly ProductEntry[],
  category: CategoryId,
): string[] {
  return entries
    .filter(
      (entry) =>
        entry.category === category && entry.available && DEFAULT_PRODUCTS.includes(entry.id),
    )
    .flatMap(rowKeys);
}

/**
 * Most product layers drawn at once (035): each is a full-screen raster or particle pass, so more
 * would cost frame time without being readable over each other.
 */
export const MAX_PRODUCT_LAYERS = 4;

/** What a product layer left out by {@link boundProductLayers} says, in the rail. */
export const OVER_LIMIT_MESSAGE = `Not drawn: at most ${MAX_PRODUCT_LAYERS} overlays are drawn at once.`;

/**
 * The product layers to draw from those turned on (bottom first): the top
 * {@link MAX_PRODUCT_LAYERS}, which are the ones seen; the rest are `dropped`.
 */
export function boundProductLayers(
  keys: readonly string[],
  max = MAX_PRODUCT_LAYERS,
): { drawn: string[]; dropped: string[] } {
  const cut = Math.max(0, keys.length - max);
  return { drawn: keys.slice(cut), dropped: keys.slice(0, cut) };
}
