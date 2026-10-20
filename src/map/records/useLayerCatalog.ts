import { useEffect, useMemo, useState } from 'react';
import { unwrap, type ForesignalClient } from '../../api/client';
import { FsError } from '../../api/errors';
import type { StyleModel } from '../style/model';
import {
  buildCatalog,
  type KindSummary,
  type LayerCatalog,
  type TileLayerSummary,
} from './catalog';

/** Where loading the layer catalog stands. */
export type LayerCatalogState =
  | { status: 'loading' }
  | { status: 'ready'; catalog: LayerCatalog }
  | { status: 'error'; error: unknown };

/** The raw responses, kept so a new style rebuilds the catalog without refetching. */
type Loaded =
  | { status: 'ready'; index: TileLayerSummary[]; kinds: KindSummary[] }
  | { status: 'error'; error: unknown };

/** How often the kind counts (`listKinds`) are read again, in ms. */
export const KINDS_REFRESH_MS = 60_000;

/**
 * How many more times the first load is tried while the backend answers 429 or 503. The API
 * client already retries those a few times within a second or two; a page that opens into a burst
 * of tile requests can outlast that, and without the catalog the rail and map have nothing.
 */
export const CATALOG_LOAD_RETRIES = 10;

/**
 * The wait before retrying the first load, in ms: the backend's `Retry-After` (1 s when absent),
 * plus a second for each try already made. Undefined when the error is not a rate limit or a busy
 * backend, or the retries are spent.
 */
export function catalogRetryDelay(error: unknown, retried: number): number | undefined {
  if (!(error instanceof FsError) || (error.status !== 429 && error.status !== 503)) return;
  if (retried >= CATALOG_LOAD_RETRIES) return;
  return ((error.retryAfter ?? 1) + retried) * 1000;
}

/**
 * Loads the record layer catalog (`listTileLayers` and `listKinds`) once per API client (waiting
 * out a rate limit or a busy backend, {@link catalogRetryDelay}), reads
 * the kind counts again every {@link KINDS_REFRESH_MS}, and builds the rail's lists with the
 * overlay style's icons whenever the style or the counts change.
 */
export function useLayerCatalog(
  api: ForesignalClient | undefined,
  model: StyleModel | undefined,
): LayerCatalogState {
  const [loaded, setLoaded] = useState<{ api: ForesignalClient; result: Loaded }>();
  useEffect(() => {
    if (!api) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (retried: number) =>
      Promise.all([unwrap(api.GET('/v1/tiles.json')), unwrap(api.GET('/v1/kinds'))]).then(
        ([index, kinds]) => {
          if (active) setLoaded({ api, result: { status: 'ready', index: index.layers, kinds } });
        },
        (error: unknown) => {
          if (!active) return;
          const delay = catalogRetryDelay(error, retried);
          if (delay !== undefined) {
            retry = setTimeout(() => load(retried + 1), delay);
            return;
          }
          console.error('ForeSignal: the layer catalog did not load.', error);
          setLoaded({ api, result: { status: 'error', error } });
        },
      );
    load(0);
    // The counts move as records arrive and expire; a kind that gains its first records is drawn
    // once a refresh lists it. A failed refresh keeps the last counts.
    const timer = setInterval(() => {
      unwrap(api.GET('/v1/kinds')).then(
        (kinds) => {
          if (!active) return;
          setLoaded((current) =>
            current?.api === api && current.result.status === 'ready'
              ? { api, result: { ...current.result, kinds } }
              : current,
          );
        },
        (error: unknown) => console.warn('ForeSignal: the kind counts did not refresh.', error),
      );
    }, KINDS_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(retry);
    };
  }, [api]);

  const result = loaded?.api === api ? loaded?.result : undefined;
  return useMemo((): LayerCatalogState => {
    if (!result) return { status: 'loading' };
    if (result.status === 'error') return result;
    return { status: 'ready', catalog: buildCatalog(result.index, result.kinds, model) };
  }, [result, model]);
}
