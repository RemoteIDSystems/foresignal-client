import { useState } from 'react';
import type { ForesignalClient } from '../api/client';
import type { Part } from '../intel/useEvidence';
import { useRead } from '../intel/useHypotheses';
import { selectionRef } from '../objects/selectObject';
import { useStoreKey, type AppState, type Store } from '../state/store';
import {
  imageryProducts,
  loadComparisonFrames,
  loadRecentImagery,
  type RecentImagery,
  type RecentImageryQuery,
} from './imageryApi';
import { isComparable, viewArea, type Bbox, type ComparisonFrame } from './imageryView';
import type { Product } from '../map/products/productApi';

/** The instant a page opened, floored to the minute, so it reads once rather than on every render. */
function useOpenedAt(): number {
  const [now] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  return now;
}

/**
 * Recent Imagery over the committed view and for the selected object ({@link loadRecentImagery}),
 * read again when the view moves by a whole degree or the selection changes.
 */
export function useRecentImagery(
  api: ForesignalClient | undefined,
  store: Store<AppState> | undefined,
): { imagery: Part<RecentImagery>; area: Bbox } {
  const viewport = useStoreKey('viewport', store);
  const selection = useStoreKey('selection', store);
  const now = useOpenedAt();
  const area = viewArea(viewport?.bbox);
  const ref = selectionRef(selection);
  const query: RecentImageryQuery = { area, now, ...(ref && { ref }) };
  const imagery = useRead(api, JSON.stringify(query), (client, key, signal) =>
    loadRecentImagery(client, JSON.parse(key) as RecentImageryQuery, signal),
  );
  return { imagery, area };
}

/** The products the comparison can show: imagery products that can be compared. */
export function useComparableProducts(api: ForesignalClient | undefined): Part<Product[]> {
  return useRead(api, 'comparable-products', async (client, _key, signal) =>
    (await imageryProducts(client, signal)).filter(isComparable),
  );
}

/** The frames one product offers to compare over a view ({@link loadComparisonFrames}). */
export function useComparisonFrames(
  api: ForesignalClient | undefined,
  product: Product | undefined,
  area: Bbox,
): Part<ComparisonFrame[]> {
  const now = useOpenedAt();
  return useRead(
    api,
    product ? JSON.stringify({ product, area, now }) : undefined,
    (client, key, signal) => {
      const query = JSON.parse(key) as { product: Product; area: Bbox; now: number };
      return loadComparisonFrames(client, query.product, query.area, query.now, signal);
    },
  );
}
