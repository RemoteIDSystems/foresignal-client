import { useState } from 'react';
import { Save, X } from 'lucide-react';
import { useRead } from '../intel/useHypotheses';
import { viewLayerId } from '../map/records/viewLayers';
import { useRecordLayers } from '../views/global/recordLayersContext';
import { Button, IconButton } from '../ui/Button';
import styles from './Saved.module.css';
import { createView, getView, listViews } from './savedApi';
import { SAVED_ENTRIES } from './savedEntries';
import { slugOf, viewFromMap } from './savedView';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The Global rail's saved state (031), under the layers: the saved view drawn now, if any, with
 * its layer's state and Close; **Save view**, which saves the drawn kinds, the hidden sources and
 * the map's view as a saved view (`createView`); and the Saved Views, Places and Watchlists
 * entries, each opening the saved-state dialog.
 */
export function SavedRailSection() {
  const layers = useRecordLayers();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const api = layers?.api;
  const store = layers?.store;
  const openView = layers?.openView;
  const view = useRead(api, openView, (client, id, signal) => getView(client, id, signal));
  if (!layers || !store) return null;
  const catalog = layers.catalog.status === 'ready' ? layers.catalog.catalog : undefined;
  const status = openView ? layers.statuses[viewLayerId(openView)] : undefined;

  const save = async () => {
    if (!api || !name.trim()) return;
    setBusy(true);
    setNote(undefined);
    try {
      const taken = new Set((await listViews(api)).map((existing) => existing.slug));
      const input = viewFromMap(
        name,
        {
          kinds: layers.drawnKinds ?? [],
          hiddenSources: layers.hiddenSources,
          sourcesOf: (kind) => catalog?.kinds.find((entry) => entry.id === kind)?.sources ?? [],
          bbox: store.get('viewport')?.bbox,
        },
        slugOf(name, taken),
      );
      const saved = await createView(api, input);
      setNote(`Saved “${saved.name}”.`);
      setNaming(false);
      setName('');
    } catch (error) {
      setNote(`Not saved: ${messageOf(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.railSection} aria-label="Saved state">
      {openView && (
        <div className={styles.openView} data-testid="open-view" data-state={status?.state}>
          <span>
            Saved view: <strong>{view.status === 'ready' ? view.value.name : openView}</strong>
            {status && (
              <span className={styles.muted}>
                {' '}
                · {status.state}
                {status.state === 'ready' ? `, ${status.features} records` : ''}
              </span>
            )}
          </span>
          <IconButton label="Close saved view" icon={<X size={14} />} onClick={layers.closeView} />
        </div>
      )}
      {naming ? (
        <form
          className={styles.inline}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <input
            className={styles.input}
            aria-label="View name"
            placeholder="View name"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => setNaming(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          icon={<Save size={14} />}
          onClick={() => setNaming(true)}
          disabled={!layers.drawnKinds?.length || !!openView}
          title={openView ? 'Close the saved view to save the kinds drawn' : undefined}
        >
          Save view
        </Button>
      )}
      {note && <p className={styles.muted}>{note}</p>}
      <ul className={styles.entries}>
        {SAVED_ENTRIES.map(({ tab, label, icon: Icon }) => (
          <li key={tab}>
            <button
              type="button"
              className={styles.entry}
              onClick={() => store.set('savedOpen', tab)}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
