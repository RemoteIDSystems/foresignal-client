import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../../api/client';
import { loadOverlayStyle, type OverlayStyle } from './loadOverlayStyle';

/**
 * The one value a read returns while loading, so it is the same object on every render (an
 * effect or memo that lists the result does not run again for nothing).
 */
const LOADING = { status: 'loading' } as const;

/** Where loading the overlay style stands. */
export type OverlayStyleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; overlay: OverlayStyle }
  | { status: 'error'; error: unknown };

/** A settled load and the request it answers. */
interface Settled {
  key: string;
  state: OverlayStyleState;
}

/**
 * Loads the overlay style for a theme (and, when given, a set of layers), reloading when either
 * changes. It reports `loading` until the load for the current request settles, and `idle` without
 * an API client.
 */
export function useOverlayStyle(
  api: ForesignalClient | undefined,
  theme: 'light' | 'dark',
  layers?: readonly string[],
): OverlayStyleState {
  const [settled, setSettled] = useState<Settled>();
  const layerKey = layers?.join(',');
  const key = `${theme}|${layerKey ?? '*'}`;
  useEffect(() => {
    if (!api) return;
    let active = true;
    loadOverlayStyle(api, {
      theme,
      layers: layerKey === undefined ? undefined : layerKey.split(',').filter(Boolean),
      pixelRatio: window.devicePixelRatio,
    }).then(
      (overlay) => {
        if (active) setSettled({ key, state: { status: 'ready', overlay } });
      },
      (error: unknown) => {
        console.error('ForeSignal: the map overlay style did not load.', error);
        if (active) setSettled({ key, state: { status: 'error', error } });
      },
    );
    return () => {
      active = false;
    };
  }, [api, theme, layerKey, key]);
  if (!api) return { status: 'idle' };
  return settled?.key === key ? settled.state : LOADING;
}
