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

/**
 * Loads the record layer catalog (`listTileLayers` and `listKinds`) once per API client, and
 * builds the rail's lists with the overlay style's icons whenever the style changes.
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
    return () => {
      active = false;
    };
  }, [api]);

  const result = loaded?.api === api ? loaded?.result : undefined;
  return useMemo((): LayerCatalogState => {
    if (!result) return { status: 'loading' };
    if (result.status === 'error') return result;
    return { status: 'ready', catalog: buildCatalog(result.index, result.kinds, model) };
  }, [result, model]);
}
