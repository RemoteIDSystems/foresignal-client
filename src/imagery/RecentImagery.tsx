import { useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { utcText } from '../intel/analysisView';
import type { Part } from '../intel/useEvidence';
import type { RecentImagery as Imagery } from './imageryApi';
import {
  captionOf,
  IMAGERY_FILTERS,
  matchesFilter,
  NO_CHANGE_DETECTION,
  type ImageryFilter,
  type ImageryItem,
} from './imageryView';
import { Picture } from './Picture';
import analysis from '../views/analysis/Analysis.module.css';
import styles from './Imagery.module.css';

/** Props for {@link RecentImageryGrid}. */
export interface RecentImageryGridProps {
  api: ForesignalClient | undefined;
  /** What the imagery read gave. */
  imagery: Part<Imagery>;
  /** Opens an item's full frame. */
  onOpen: (item: ImageryItem) => void;
  /** A heading level-2 title over the grid; none when the panel around it has one. */
  title?: string;
  /** How many items to show at most. */
  limit?: number;
}

/**
 * The Recent Imagery grid, as the mock draws it: the All / Optical / SAR / Thermal / Change
 * Detection filters, then a thumbnail per item with its satellite or product, source, time and
 * resolution and band, newest first. Selecting one opens its full frame.
 */
export function RecentImageryGrid({ api, imagery, onOpen, title, limit }: RecentImageryGridProps) {
  const [filter, setFilter] = useState<ImageryFilter>('all');
  const items = imagery.status === 'ready' ? imagery.value.items : [];
  const shown = items.filter((item) => matchesFilter(item, filter)).slice(0, limit);
  return (
    <div className={styles.panel} data-testid="recent-imagery" data-count={shown.length}>
      {title && <h2 className={analysis.cardTitle}>{title}</h2>}
      <div className={styles.filters} role="group" aria-label="Imagery filters">
        {IMAGERY_FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={styles.filter}
            aria-pressed={filter === entry.key}
            onClick={() => setFilter(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {imagery.status === 'loading' ? (
        <p className={analysis.muted}>Loading imagery…</p>
      ) : imagery.status === 'error' ? (
        <p className={analysis.muted}>{imagery.message}</p>
      ) : shown.length === 0 ? (
        <p className={analysis.muted}>
          {filter === 'change' ? NO_CHANGE_DETECTION : emptyText(filter)}
        </p>
      ) : (
        <ul className={styles.grid} aria-label="Recent imagery">
          {shown.map((item) => (
            <li key={item.key}>
              <ImageryTile api={api} item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
      {imagery.status === 'ready' && imagery.value.failures.length > 0 && (
        <p className={analysis.muted} data-testid="imagery-failures">
          Not read: {imagery.value.failures.join('; ')}
        </p>
      )}
    </div>
  );
}

/** What an empty filter says. */
function emptyText(filter: ImageryFilter): string {
  return filter === 'all'
    ? 'No imagery over the view: no enabled imagery product has a frame, and no scene was acquired in the last week.'
    : 'No imagery of this kind over the view.';
}

/** One item: its thumbnail, title, source, time, and resolution and band. */
export function ImageryTile({
  api,
  item,
  onOpen,
  pressed,
}: {
  api: ForesignalClient | undefined;
  item: ImageryItem;
  onOpen: (item: ImageryItem) => void;
  pressed?: boolean;
}) {
  const caption = captionOf(item);
  return (
    <button
      type="button"
      className={styles.tile}
      aria-pressed={pressed}
      aria-label={`${item.title}, ${utcText(item.time)}`}
      onClick={() => onOpen(item)}
    >
      <span className={styles.thumb}>
        <Picture api={api} spec={item.thumb} size="thumb" alt={item.title} />
      </span>
      <span className={styles.tileTitle}>{item.title}</span>
      <span className={styles.tileLine}>{item.source}</span>
      <span className={styles.tileLine}>{utcText(item.time)}</span>
      {caption && <span className={styles.tileLine}>{caption}</span>}
    </button>
  );
}
