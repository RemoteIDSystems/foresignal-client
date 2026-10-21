import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { getMediaBlob, getMediaThumbnailBlob, getProductImageBlob } from './imageryApi';
import type { ImageSpec } from './imageryView';

/** Where fetching a picture stands: its URL to draw, or why there is none. */
export type ImageUrlState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string }
  | { status: 'none' };

/**
 * A URL an `<img>` can draw for a picture. Media and product frames are fetched through the API
 * client (it adds the token) and handed over as object URLs, revoked when the picture changes or
 * the component goes; a media thumbnail is the 256 px rendition (`getMediaThumbnail`) and a full
 * frame the stored image (`getMedia`). A plain URL is drawn as is. Mosaics of tiles are not fetched
 * here (their tiles are plain URLs), and nothing to show is `none`.
 */
export function useImageUrl(
  api: ForesignalClient | undefined,
  spec: ImageSpec,
  size: 'thumb' | 'full',
): ImageUrlState {
  const key = JSON.stringify([spec, size]);
  const [state, setState] = useState<{ key: string; value: ImageUrlState }>();
  const fetched = spec.type === 'media' || spec.type === 'product-image';
  useEffect(() => {
    if (!api || !fetched) return;
    const [current, wanted] = JSON.parse(key) as [ImageSpec, 'thumb' | 'full'];
    const controller = new AbortController();
    let url: string | undefined;
    const blob =
      current.type === 'media'
        ? wanted === 'thumb'
          ? getMediaThumbnailBlob(api, current.mediaId, 256, controller.signal)
          : getMediaBlob(api, current.mediaId, controller.signal)
        : getProductImageBlob(
            api,
            (current as Extract<ImageSpec, { type: 'product-image' }>).href,
            controller.signal,
          );
    blob.then(
      (loaded) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(loaded);
        setState({ key, value: { status: 'ready', url } });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'The image did not load.';
        setState({ key, value: { status: 'error', message } });
      },
    );
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, key, fetched]);
  if (spec.type === 'url') return { status: 'ready', url: spec.url };
  if (!fetched) return { status: 'none' };
  return state?.key === key ? state.value : { status: 'loading' };
}
