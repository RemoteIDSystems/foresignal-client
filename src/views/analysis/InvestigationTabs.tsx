import { useMemo, useState, type FormEvent } from 'react';
import { Download, Trash2 } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { envelopeAllows, itemRef, itemTitle, utcText } from '../../intel/analysisView';
import {
  addInvestigationItem,
  exportInvestigation,
  removeInvestigationItem,
  type ExportFormat,
  type InvestigationItemInput,
} from '../../intel/investigationApi';
import type { InvestigationAnalysis } from '../../intel/useAnalysis';
import { prettifyId } from '../../lib/labels';
import { ADDABLE_ITEM_TYPES } from './frame';
import styles from './Analysis.module.css';

/**
 * An investigation's Overview: its summary as written, the tags, owner, visibility and TLP, the
 * items by type, and the hypothesis sets, forecast questions and reports linked to it.
 */
export function InvestigationOverview({ analysis }: { analysis: InvestigationAnalysis }) {
  const { investigation } = analysis;
  const items = investigation.items;
  const byType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items ?? []) {
      counts.set(item.itemType, (counts.get(item.itemType) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [items]);
  return (
    <div className={styles.grid} data-testid="investigation-overview">
      <section className={styles.card} aria-labelledby="inv-summary">
        <h2 id="inv-summary" className={styles.cardTitle}>
          Summary
        </h2>
        <p className={styles.text}>{investigation.summary?.trim() || 'No summary written yet.'}</p>
        {investigation.tags && investigation.tags.length > 0 && (
          <div className={styles.listMeta}>
            {investigation.tags.map((tag) => (
              <Badge key={tag} tone="neutral">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <dl className={styles.facts}>
          <dt>Owner</dt>
          <dd>{investigation.owner?.displayName ?? investigation.createdBy}</dd>
          <dt>Visibility</dt>
          <dd>{investigation.visibility ?? '—'}</dd>
          <dt>TLP</dt>
          <dd>{investigation.tlp ?? '—'}</dd>
          <dt>Opened</dt>
          <dd>{utcText(investigation.createdAt)}</dd>
        </dl>
      </section>
      <section className={styles.card} aria-labelledby="inv-items">
        <h2 id="inv-items" className={styles.cardTitle}>
          Items ({(investigation.itemCount ?? items?.length ?? 0).toLocaleString('en-US')})
        </h2>
        {byType.length === 0 && <p className={styles.muted}>No items pinned yet.</p>}
        {byType.map(([type, count]) => (
          <div key={type} className={styles.familyRow}>
            <span>{prettifyId(type)}</span>
            <span className={styles.muted}>{count}</span>
          </div>
        ))}
      </section>
      <section className={styles.card} aria-labelledby="inv-links">
        <h2 id="inv-links" className={styles.cardTitle}>
          Linked
        </h2>
        <dl className={styles.facts}>
          <dt>Hypothesis sets</dt>
          <dd>{investigation.hypothesisSetIds?.length ?? 0}</dd>
          <dt>Forecast questions</dt>
          <dd>{investigation.questionIds?.length ?? 0}</dd>
          <dt>Reports</dt>
          <dd>{investigation.reportIds?.length ?? 0}</dd>
        </dl>
      </section>
    </div>
  );
}

/**
 * An investigation's Items tab: each pinned item with its type, title, note and who added it when.
 * Where the investigation's envelope offers it, an item can be added (type, ref and note) and
 * removed after a confirm; otherwise the list is read-only and says why.
 */
export function ItemsTab({
  api,
  analysis,
  onOpen,
  onChanged,
}: {
  api: ForesignalClient | undefined;
  analysis: InvestigationAnalysis;
  onOpen: (ref: string) => void;
  onChanged: () => void;
}) {
  const { investigation, envelope } = analysis;
  const items = investigation.items ?? [];
  const canAdd = envelopeAllows(envelope?.actions, 'POST', /\/items\/?$/);
  const canRemove = envelopeAllows(envelope?.actions, 'DELETE', /\/items\//);
  const [type, setType] = useState<InvestigationItemInput['itemType']>('record');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      onChanged();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change was not made.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!api || !ref.trim()) return;
    const done = await run(() =>
      addInvestigationItem(api, investigation.id, {
        itemType: type,
        ref: ref.trim(),
        ...(note.trim() && { note: note.trim() }),
      }),
    );
    if (done) {
      setRef('');
      setNote('');
    }
  };
  const remove = (itemId: string) =>
    api && void run(() => removeInvestigationItem(api, investigation.id, itemId));

  return (
    <div data-testid="items-tab">
      {canAdd ? (
        <form className={styles.form} onSubmit={(event) => void add(event)} aria-label="Add item">
          <label>
            <span className={styles.visuallyHidden}>Item type</span>
            <select
              className={styles.select}
              value={type}
              onChange={(e) => setType(e.target.value as InvestigationItemInput['itemType'])}
            >
              {ADDABLE_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {prettifyId(t)}
                </option>
              ))}
            </select>
          </label>
          <input
            className={styles.input}
            aria-label="Item reference"
            placeholder="Reference, e.g. usgs-earthquakes/nc75095651"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
          <input
            className={styles.input}
            aria-label="Note"
            placeholder="Note (optional)"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy || !ref.trim()}>
            Add item
          </Button>
        </form>
      ) : (
        <p className={styles.muted}>
          Adding and removing items needs the agent or admin scope; this view is read-only.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className={styles.muted}>No items pinned yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Items">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Note</th>
                <th>Added</th>
                {canRemove && (
                  <th>
                    <span className={styles.visuallyHidden}>Remove</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const target = itemRef(item);
                return (
                  <tr key={item.id} data-item-type={item.itemType}>
                    <td>
                      {target ? (
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => onOpen(target)}
                        >
                          {itemTitle(item)}
                        </button>
                      ) : (
                        itemTitle(item)
                      )}
                    </td>
                    <td>{prettifyId(item.itemType)}</td>
                    <td>{item.note ?? ''}</td>
                    <td>
                      {utcText(item.addedAt)} · {item.addedBy}
                    </td>
                    {canRemove && (
                      <td>
                        {confirming === item.id ? (
                          <Button
                            variant="primary"
                            disabled={busy}
                            onClick={() => {
                              setConfirming(undefined);
                              remove(item.id);
                            }}
                          >
                            Confirm remove
                          </Button>
                        ) : (
                          <IconButton
                            label={`Remove “${itemTitle(item)}”`}
                            icon={<Trash2 size={14} />}
                            onClick={() => setConfirming(item.id)}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const EXPORTS: readonly { format: ExportFormat; label: string; extension: string }[] = [
  { format: 'md', label: 'Markdown report', extension: 'md' },
  { format: 'json', label: 'JSON', extension: 'json' },
  { format: 'geojson', label: 'GeoJSON', extension: 'geojson' },
];

/**
 * The Export tab: the investigation as a Markdown report with citations, JSON or GeoJSON
 * (`exportInvestigation`), saved as a file named by its display id.
 */
export function ExportPanel({
  api,
  analysis,
}: {
  api: ForesignalClient | undefined;
  analysis: InvestigationAnalysis;
}) {
  const [busy, setBusy] = useState<ExportFormat>();
  const [error, setError] = useState<string>();
  const { investigation } = analysis;
  const save = async (format: ExportFormat, extension: string) => {
    if (!api) return;
    setBusy(format);
    setError(undefined);
    try {
      const file = await exportInvestigation(api, investigation.id, format);
      const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${investigation.displayId}.${extension}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The export failed.');
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <div className={styles.card} data-testid="export-panel">
      <h2 className={styles.cardTitle}>Export {investigation.displayId}</h2>
      <p className={styles.muted}>
        Every format carries the backend's header, "Automated analysis inputs; verify before
        acting", and the sources' attributions.
      </p>
      <div className={styles.actions}>
        {EXPORTS.map(({ format, label, extension }) => (
          <Button
            key={format}
            icon={<Download size={14} />}
            disabled={busy !== undefined}
            onClick={() => void save(format, extension)}
          >
            {busy === format ? 'Exporting…' : label}
          </Button>
        ))}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
