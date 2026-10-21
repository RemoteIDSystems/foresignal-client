import type { ForesignalClient } from '../api/client';
import { utcText } from '../intel/analysisView';
import { useRead } from '../intel/useHypotheses';
import { recordRef } from '../lib/objectRef';
import analysis from '../views/analysis/Analysis.module.css';
import { getViewRecords } from './savedApi';

/** How many of a view's current records are listed. */
export const VIEW_RECORDS_SHOWN = 20;

/** A record's headline: its title, else its external id. */
function headline(record: { title?: string | null; externalId: string }): string {
  return record.title || record.externalId;
}

/**
 * The current records a saved view matches (`getViewRecords`), the first
 * {@link VIEW_RECORDS_SHOWN}, each opening its record. The backend evaluates the view.
 */
export function ViewRecords({
  api,
  viewId,
  onOpen,
  empty = 'No current record matches this view.',
}: {
  api: ForesignalClient | undefined;
  viewId: string;
  /** Opens a record by its object ref. */
  onOpen: (ref: string) => void;
  /** What to say when none matches. */
  empty?: string;
}) {
  const records = useRead(api, viewId, (client, id, signal) =>
    getViewRecords(client, id, VIEW_RECORDS_SHOWN, signal),
  );
  if (records.status === 'loading') return <p className={analysis.muted}>Loading records…</p>;
  if (records.status === 'error')
    return <p className={analysis.muted}>The records did not load: {records.message}</p>;
  if (!records.value.length) return <p className={analysis.muted}>{empty}</p>;
  return (
    <div className={analysis.tableWrap}>
      <table className={analysis.table}>
        <caption className={analysis.visuallyHidden}>Current records</caption>
        <thead>
          <tr>
            <th scope="col">Record</th>
            <th scope="col">Kind</th>
            <th scope="col">Source</th>
            <th scope="col">Observed</th>
          </tr>
        </thead>
        <tbody>
          {records.value.map((record) => (
            <tr key={record.id}>
              <td>
                <button
                  type="button"
                  className={analysis.linkButton}
                  onClick={() => onOpen(recordRef(record.source, record.externalId))}
                >
                  {headline(record)}
                </button>
              </td>
              <td>{record.kind}</td>
              <td>{record.source}</td>
              <td>{utcText(record.observedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
