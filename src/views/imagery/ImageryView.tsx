import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ForesignalClient } from '../../api/client';
import { ImageryComparison } from '../../imagery/ImageryComparison';
import { ImageryViewer } from '../../imagery/ImageryViewer';
import type { ImageryItem } from '../../imagery/imageryView';
import { RecentImageryGrid } from '../../imagery/RecentImagery';
import { useRecentImagery } from '../../imagery/useRecentImagery';
import { useOpenObject } from '../../intel/useOpenObject';
import type { AppState, Store } from '../../state/store';
import { Tabs } from '../../ui/Tabs';
import analysis from '../analysis/Analysis.module.css';
import styles from './ImageryView.module.css';

/** Props for {@link ImageryView}. */
export interface ImageryViewProps {
  api: ForesignalClient | undefined;
  store: Store<AppState>;
}

type ImageryTab = 'recent' | 'change';

const TABS: readonly { key: ImageryTab; label: string }[] = [
  { key: 'recent', label: 'Recent Imagery' },
  { key: 'change', label: 'Change Detection' },
];

/**
 * The Imagery screen (028): Recent Imagery over the last committed view, opening each full frame,
 * and the before/after comparison (`?tab=change`, as the Satellite view's Change Detection entry
 * links it).
 */
export function ImageryView({ api, store }: ImageryViewProps) {
  const [params, setParams] = useSearchParams();
  const tab: ImageryTab = params.get('tab') === 'change' ? 'change' : 'recent';
  const { imagery, area } = useRecentImagery(api, store);
  const [open, setOpen] = useState<ImageryItem>();
  const openObject = useOpenObject(api, store);
  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Imagery</h1>
        <Tabs
          items={TABS}
          value={tab}
          onChange={(key) => setParams(key === 'change' ? { tab: 'change' } : {})}
          label="Imagery views"
        />
      </div>
      <p className={analysis.muted}>
        Over {area.join(', ')} (west, south, east, north), the last view committed on a map.
      </p>
      <section
        className={styles.card}
        aria-label={tab === 'change' ? 'Imagery comparison' : 'Recent imagery'}
      >
        {tab === 'change' ? (
          <ImageryComparison api={api} area={area} title="Imagery Comparison" />
        ) : (
          <RecentImageryGrid api={api} imagery={imagery} onOpen={setOpen} title="Recent Imagery" />
        )}
      </section>
      <ImageryViewer
        api={api}
        item={open}
        onClose={() => setOpen(undefined)}
        onOpenObject={(ref) => void openObject(ref)}
      />
    </div>
  );
}
