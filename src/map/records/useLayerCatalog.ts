import { useEffect, useMemo, useState } from 'react';
import { unwrap, type ForesignalClient } from '../../api/client';
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
 * Loads the record layer catalog (`listTileLayers` and `listKinds`) once per API client, reads
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
    Promise.all([unwrap(api.GET('/v1/tiles.json')), unwrap(api.GET('/v1/kinds'))]).then(
      ([index, kinds]) => {
        if (active) setLoaded({ api, result: { status: 'ready', index: index.layers, kinds } });
      },
      (error: unknown) => {
        console.error('ForeSignal: the layer catalog did not load.', error);
        if (active) setLoaded({ api, result: { status: 'error', error } });
      },
    );
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
    };
  }, [api]);

  const result = loaded?.api === api ? loaded?.result : undefined;
  return useMemo((): LayerCatalogState => {
    if (!result) return { status: 'loading' };
    if (result.status === 'error') return result;
    return { status: 'ready', catalog: buildCatalog(result.index, result.kinds, model) };
  }, [result, model]);
}
