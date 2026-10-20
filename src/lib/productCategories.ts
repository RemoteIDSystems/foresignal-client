import type { CategoryId } from './kindCategories';

/** A product's own category, as `listProducts` gives it. */
export type ProductCategory = 'radar' | 'satellite' | 'model' | 'lightning' | 'imagery';

/**
 * The rail category each product category is listed under. Radar, satellite cloud imagery, model
 * fields and lightning are the Global mock's Weather (its globe shows clouds and a storm under
 * that checked row); `imagery` products (true color, night lights, sea surface temperature) are
 * its Imagery (Recent).
 */
export const PRODUCT_RAIL_CATEGORY: Record<ProductCategory, CategoryId> = {
  radar: 'weather',
  satellite: 'weather',
  model: 'weather',
  lightning: 'weather',
  imagery: 'imagery',
};

/** How each product category is headed in the rail. */
export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  radar: 'Radar',
  satellite: 'Satellite',
  model: 'Models',
  lightning: 'Lightning',
  imagery: 'Imagery',
};

/**
 * The products on when the dashboard opens, as long as they can be drawn: cloud-top infrared and
 * composite radar reflectivity, the clouds and the storm the Global mock shows under Weather,
 * which the mock has checked. A product that is disabled or has no frame stays off.
 */
export const DEFAULT_PRODUCTS: readonly string[] = ['goes-east-ir', 'mrms-reflectivity'];
