import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../../api/client';
import { loadProducts, type Product } from './productApi';

/** Where loading the product catalog stands. */
export type ProductsState =
  | { status: 'loading' }
  | { status: 'ready'; products: Product[] }
  | { status: 'error'; error: unknown };

/** How often the product catalog (health and status) is read again, in ms. */
export const PRODUCTS_REFRESH_MS = 5 * 60_000;

/**
 * Loads the product catalog (`listProducts`, every page) once per API client and again every
 * {@link PRODUCTS_REFRESH_MS}, so a product that is enabled or disabled shows as such. A failed
 * refresh keeps the last catalog.
 */
export function useProducts(api: ForesignalClient | undefined): ProductsState {
  const [state, setState] = useState<{ api: ForesignalClient; state: ProductsState }>();
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    const load = (first: boolean) =>
      loadProducts(api, controller.signal).then(
        (products) => {
          if (!controller.signal.aborted) setState({ api, state: { status: 'ready', products } });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          console.warn('ForeSignal: the product catalog did not load.', error);
          if (first) setState({ api, state: { status: 'error', error } });
        },
      );
    void load(true);
    const timer = setInterval(() => void load(false), PRODUCTS_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [api]);
  return state && state.api === api ? state.state : { status: 'loading' };
}
