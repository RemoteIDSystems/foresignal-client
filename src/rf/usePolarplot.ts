import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { FsError } from '../api/errors';
import { getPolarplotBlob, NO_ACTIVE_PASS } from './rfApi';
import { POLARPLOT_REFRESH_MS } from './rfView';

/** Where a ground station's polar plot stands. */
export type PolarplotState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; at: number }
  | { status: 'no-pass' }
  | { status: 'error'; message: string };

/**
 * A ground station's live polar plot (`getGroundStationPolarplot`), read now and again every
 * {@link POLARPLOT_REFRESH_MS} while shown, and handed over as an object URL (the API client adds
 * the token). Each new plot replaces the last, whose URL is then revoked. A 404 `NO_ACTIVE_PASS`
 * is `no-pass`: the station is tracking nothing, and the next read may find a pass.
 */
export function usePolarplot(
  api: ForesignalClient | undefined,
  sourceId: string | undefined,
): PolarplotState {
  const [state, setState] = useState<{ key: string; value: PolarplotState }>();
  useEffect(() => {
    if (!api || !sourceId) return;
    const controller = new AbortController();
    let url: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      getPolarplotBlob(api, sourceId, controller.signal)
        .then(
          (blob) => {
            if (controller.signal.aborted) return;
            const previous = url;
            url = URL.createObjectURL(blob);
            setState({ key: sourceId, value: { status: 'ready', url, at: Date.now() } });
            if (previous) URL.revokeObjectURL(previous);
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            if (url) URL.revokeObjectURL(url);
            url = undefined;
            setState({
              key: sourceId,
              value:
                error instanceof FsError && error.code === NO_ACTIVE_PASS
                  ? { status: 'no-pass' }
                  : {
                      status: 'error',
                      message:
                        error instanceof Error ? error.message : 'The polar plot did not load.',
                    },
            });
          },
        )
        .finally(() => {
          if (!controller.signal.aborted) timer = setTimeout(read, POLARPLOT_REFRESH_MS);
        });
    };
    read();
    return () => {
      controller.abort();
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, sourceId]);
  if (!sourceId) return { status: 'error', message: 'This sensor has no polar plot.' };
  return state?.key === sourceId ? state.value : { status: 'loading' };
}
