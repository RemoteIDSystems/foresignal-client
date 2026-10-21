import type { ForesignalClient } from '../api/client';
import { utcText } from '../intel/analysisView';
import { useRead } from '../intel/useHypotheses';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { getMediaMeta, type Media } from './imageryApi';
import { BAND_LABELS, type ImageryItem } from './imageryView';
import { Picture } from './Picture';
import analysis from '../views/analysis/Analysis.module.css';
import styles from './Imagery.module.css';

/** Props for {@link ImageryViewer}. */
export interface ImageryViewerProps {
  api: ForesignalClient | undefined;
  /** The item open, or undefined for none. */
  item: ImageryItem | undefined;
  onClose: () => void;
  /** Opens the object an item is, if the page can (a scene, a dossier's imagery). */
  onOpenObject?: (ref: string) => void;
}

/** Where each origin's items come from, as the viewer's facts say. */
const ORIGINS: Readonly<Record<ImageryItem['origin'], string>> = {
  product: 'Product frame',
  external: 'External product',
  scene: 'Scene',
  dossier: 'Object imagery',
};

/**
 * The full-frame viewer: the item's full picture (`getMedia` for stored media, the product frame at
 * 1024 px for a product, a 3 × 3 tile mosaic for an external product), with its facts, the stored
 * media's row (`getMediaMeta`) when it is media, and the attribution its provider requires.
 */
export function ImageryViewer({ api, item, onClose, onOpenObject }: ImageryViewerProps) {
  return (
    <Modal open={item !== undefined} title={item?.title ?? ''} onClose={onClose} size="full">
      {item && (
        <div className={styles.viewer} data-testid="imagery-viewer">
          <div className={styles.viewerFrame}>
            {item.full.type === 'none' ? (
              <p className={analysis.muted}>
                The backend holds no picture of this {item.origin === 'scene' ? 'scene' : 'item'}.
              </p>
            ) : (
              <Picture api={api} spec={item.full} size="full" alt={item.title} />
            )}
          </div>
          <div className={styles.viewerSide}>
            <dl className={analysis.facts}>
              <Fact label="Source" value={item.source} />
              <Fact label="Time (UTC)" value={utcText(item.time)} />
              <Fact label="Resolution" value={item.resolution} />
              <Fact label="Band" value={item.band ? BAND_LABELS[item.band] : '—'} />
              <Fact label="From" value={ORIGINS[item.origin]} />
            </dl>
            {item.full.type === 'media' && <MediaFacts api={api} mediaId={item.full.mediaId} />}
            {item.attribution && <p className={styles.attribution}>{item.attribution}</p>}
            {item.ref && onOpenObject && (
              <Button variant="primary" onClick={() => onOpenObject(item.ref!)}>
                Open object →
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** One fact row. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** The stored media's row: type, size, role, license and expiry (`getMediaMeta`). */
function MediaFacts({ api, mediaId }: { api: ForesignalClient | undefined; mediaId: string }) {
  const meta = useRead(api, mediaId, (client, key, signal) => getMediaMeta(client, key, signal));
  if (meta.status === 'loading') return <p className={analysis.muted}>Reading the media row…</p>;
  if (meta.status === 'error') return <p className={analysis.muted}>{meta.message}</p>;
  const media: Media = meta.value;
  return (
    <dl className={analysis.facts} data-testid="media-facts">
      <Fact label="Type" value={media.contentType} />
      <Fact label="Size" value={`${media.width} × ${media.height} px`} />
      <Fact label="Role" value={media.role} />
      <Fact label="License" value={media.licence ?? '—'} />
      <Fact label="Stored" value={utcText(media.createdAt)} />
      <Fact
        label="Expires"
        value={media.expiresAt ? utcText(media.expiresAt) : 'With its record'}
      />
    </dl>
  );
}
