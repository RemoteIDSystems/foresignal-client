import { useMemo, useState } from 'react';
import { CircleAlert, LoaderCircle, Plus, ZoomIn } from 'lucide-react';
import type { LayerEntry } from '../../map/records/catalog';
import type { RecordLayerStatus } from '../../map/records/recordLayers';
import { KindSwatch } from '../../map/style/legend';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import { useRecordLayers, type RecordLayersValue } from './recordLayersContext';
import styles from './GlobalDashboard.module.css';

type RailTab = 'layers' | 'entities' | 'filters';
type LayerGroup = 'kinds' | 'sources';

/**
 * The left LAYERS / ENTITIES / FILTERS rail. LAYERS lists the backend's record layers
 * (`listTileLayers`), by kind or by source, each with its icon from the overlay style, its label
 * (the 006 prettifier for kinds, the backend's name for sources), its record count where
 * `listKinds` tells it, and a toggle that draws it on the map. A filter box narrows the list.
 * ENTITIES and FILTERS are stubs until their prompts.
 */
export function LayersRail() {
  const layers = useRecordLayers();
  const [tab, setTab] = useState<RailTab>('layers');

  return (
    <section className={styles.rail} aria-label="Layers">
      <Tabs
        label="Rail sections"
        variant="boxed"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'layers', label: 'Layers' },
          { key: 'entities', label: 'Entities' },
          { key: 'filters', label: 'Filters' },
        ]}
      />
      {tab === 'layers' ? (
        <LayersTab layers={layers} />
      ) : (
        <p className={styles.empty}>
          {tab === 'entities'
            ? 'Entity list arrives with live data.'
            : 'Per-layer filters arrive with the layer store (012).'}
        </p>
      )}
    </section>
  );
}

/** The LAYERS tab. */
function LayersTab({ layers }: { layers: RecordLayersValue | undefined }) {
  const [group, setGroup] = useState<LayerGroup>('kinds');
  const [filter, setFilter] = useState('');
  const catalog = layers?.catalog.status === 'ready' ? layers.catalog.catalog : undefined;
  const entries = useMemo(() => {
    const list = catalog ? catalog[group] : [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (entry) => entry.label.toLowerCase().includes(needle) || entry.id.includes(needle),
    );
  }, [catalog, group, filter]);

  if (!layers) return <p className={styles.empty}>Layers need a backend connection.</p>;
  if (layers.catalog.status === 'loading') return <p className={styles.empty}>Loading layers…</p>;
  if (layers.catalog.status === 'error') {
    return (
      <p className={styles.empty} role="alert">
        The layer list did not load.
      </p>
    );
  }
  const on = layers.enabled.size;

  return (
    <>
      <div className={styles.railTools}>
        <Tabs
          label="Group layers"
          variant="pill"
          value={group}
          onChange={setGroup}
          items={[
            { key: 'kinds', label: `Kinds ${catalog?.kinds.length ?? 0}` },
            { key: 'sources', label: `Sources ${catalog?.sources.length ?? 0}` },
          ]}
        />
        <input
          className={styles.railFilter}
          type="search"
          placeholder="Filter layers"
          aria-label="Filter layers"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className={styles.railSummary} data-testid="layers-on">
          <span>{on === 0 ? 'No layers on' : `${on} on`}</span>
          {on > 0 && (
            <button type="button" className={styles.linkButton} onClick={layers.clear}>
              Turn all off
            </button>
          )}
        </div>
      </div>
      <ul className={styles.layerList}>
        {entries.map((entry) => (
          <LayerRow
            key={entry.id}
            entry={entry}
            layers={layers}
            status={layers.enabled.has(entry.id) ? layers.statuses[entry.id] : undefined}
          />
        ))}
        {entries.length === 0 && <li className={styles.empty}>No layers match “{filter}”.</li>}
      </ul>
      <div className={styles.railFooter}>
        <Button icon={<Plus size={14} />}>Add Layer</Button>
      </div>
    </>
  );
}

/** One layer: toggle, icon, label, count and what the map shows of it. */
function LayerRow({
  entry,
  layers,
  status,
}: {
  entry: LayerEntry;
  layers: RecordLayersValue;
  status: RecordLayerStatus | undefined;
}) {
  const checked = layers.enabled.has(entry.id);
  return (
    <li data-layer={entry.id} data-layer-state={status?.state}>
      <label
        className={entry.count === 0 ? `${styles.layerRow} ${styles.layerEmpty}` : styles.layerRow}
        title={entry.type === 'source' ? entry.id : undefined}
      >
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={checked}
          onChange={() => layers.toggle(entry.id)}
        />
        {entry.swatch ? (
          <KindSwatch style={entry.swatch} sprite={layers.sprite} api={layers.api} />
        ) : (
          <span className={styles.noSwatch} aria-hidden="true" />
        )}
        <span className={styles.layerName}>{entry.label}</span>
        <StatusMark status={status} entry={entry} />
        {entry.count !== undefined && (
          <Badge kind="count">{entry.count.toLocaleString('en-US')}</Badge>
        )}
      </label>
    </li>
  );
}

/** A small mark for a layer that is loading, failed, or shown as hexagon counts at this zoom. */
function StatusMark({ status, entry }: { status?: RecordLayerStatus; entry: LayerEntry }) {
  if (!status) return null;
  if (status.state === 'loading') {
    return <LoaderCircle className={styles.spin} size={13} aria-label="Loading" />;
  }
  if (status.state === 'error') {
    return (
      <CircleAlert
        size={13}
        color="#ff6b6b"
        aria-label={`Did not load: ${status.message ?? 'error'}`}
      >
        <title>{status.message}</title>
      </CircleAlert>
    );
  }
  if (status.state === 'aggregated') {
    return (
      <ZoomIn
        size={13}
        color="#9fb4c8"
        aria-label={`Zoom in past ${entry.aggBelowZoom} to see records`}
      >
        <title>{`Zoom in past ${entry.aggBelowZoom} to see records; hexagon counts arrive in 008`}</title>
      </ZoomIn>
    );
  }
  return null;
}
