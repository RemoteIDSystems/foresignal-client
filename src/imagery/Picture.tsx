import type { ForesignalClient } from '../api/client';
import { mosaicUrls, type ImageSpec } from './imageryView';
import { useImageUrl } from './useImageUrl';
import styles from './Imagery.module.css';

/** Props for {@link Picture}. */
export interface PictureProps {
  api: ForesignalClient | undefined;
  /** What to draw. */
  spec: ImageSpec;
  /** A thumbnail (media at 256 px, one tile) or the full frame (the stored image, 3 × 3 tiles). */
  size: 'thumb' | 'full';
  /** The picture's text alternative. */
  alt: string;
}

/**
 * One imagery picture, however it is fetched: media and product frames through the API client, a
 * backend URL as is, an external product's tiles as a mosaic, or a note that there is none.
 */
export function Picture({ api, spec, size, alt }: PictureProps) {
  const image = useImageUrl(api, spec, size);
  if (spec.type === 'tiles') {
    const rows = mosaicUrls(spec, size === 'thumb' ? 1 : 3);
    return (
      <div
        className={styles.mosaic}
        role="img"
        aria-label={alt}
        style={{ gridTemplateColumns: `repeat(${rows[0]?.length ?? 1}, 1fr)` }}
      >
        {rows.flat().map((url) => (
          <img key={url} src={url} alt="" crossOrigin="anonymous" />
        ))}
      </div>
    );
  }
  if (image.status === 'ready') {
    return <img className={styles.picture} src={image.url} alt={alt} />;
  }
  return (
    <span className={styles.noPicture} role="img" aria-label={alt}>
      {image.status === 'loading'
        ? 'Loading…'
        : image.status === 'error'
          ? image.message
          : 'No preview'}
    </span>
  );
}
