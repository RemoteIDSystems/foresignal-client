import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { edgeFamily, incidentEdges, nodeTime, type ViewGraph } from '../../graph/graphView';
import { useGraphColors } from '../../graph/useGraphColors';
import { severityTone, utcText } from '../../intel/analysisView';
import { statusTone } from '../../objects/dossierView';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import analysis from '../analysis/Analysis.module.css';
import styles from './Workbench.module.css';

/** How many relations Key Evidence lists. */
export const KEY_EVIDENCE_ROWS = 12;

/** Props for {@link GraphSidePanel}. */
export interface GraphSidePanelProps {
  graph: ViewGraph | undefined;
  selected: string | undefined;
  onSelect: (ref: string | undefined) => void;
  /** Opens the object on its own screen (the map's dossier, or its analysis). */
  onOpen: (ref: string) => void;
}

/**
 * The right-hand SELECTED ENTITY panel of the workbench (024), from the selected node's envelope
 * as the graph read it: its title, the backend's type, status and severity, summary, first and
 * last times, sources and relations in this graph, tags and View Entity Details. Under it, KEY
 * EVIDENCE lists the relations at the node, the most confident first, each naming the backend's
 * relation type, its direction and label; the object at the other end selects it.
 */
export function GraphSidePanel({ graph, selected, onSelect, onOpen }: GraphSidePanelProps) {
  const colors = useGraphColors();
  const node = graph?.nodes.find((entry) => entry.ref === selected);
  if (!graph || !selected || !node) {
    return (
      <aside className={styles.side} aria-label="Selected entity">
        <h2 className={analysis.cardTitle}>Selected Entity</h2>
        <p className={analysis.muted}>Select an object in the graph to see it here.</p>
      </aside>
    );
  }
  const envelope = node.envelope;
  const incidents = incidentEdges(graph, node.ref);
  const first = envelope?.time?.start;
  const last = envelope ? nodeTime(envelope) : undefined;
  return (
    <aside className={styles.side} aria-label="Selected entity">
      <div className={styles.sideHeader}>
        <h2 className={analysis.cardTitle}>Selected Entity</h2>
        <IconButton
          label="Clear the selection"
          icon={<X size={14} />}
          onClick={() => onSelect(undefined)}
        />
      </div>
      <h3 className={styles.sideTitle}>{node.title}</h3>
      <div className={analysis.listMeta}>
        <Badge tone="info" uppercase={false}>
          {node.type}
        </Badge>
        {envelope?.status && (
          <Badge tone={statusTone(envelope.status)} uppercase={false}>
            {envelope.status}
          </Badge>
        )}
        {envelope?.severity && (
          <Badge tone={severityTone(envelope.severity)} uppercase={false}>
            {envelope.severity}
          </Badge>
        )}
        {envelope?.textOrigin === 'llm' && (
          <Badge tone="violet" uppercase={false}>
            llm
          </Badge>
        )}
      </div>
      {envelope?.summary && <p className={analysis.text}>{envelope.summary}</p>}
      <dl className={analysis.facts}>
        <dt>First Observed</dt>
        <dd>{first ? utcText(first) : '—'}</dd>
        <dt>Last Update</dt>
        <dd>{last ? utcText(last) : '—'}</dd>
        <dt>Sources</dt>
        <dd>{envelope?.provenance?.sourceIds?.length ?? 0}</dd>
        <dt>Relations</dt>
        <dd>{incidents.length}</dd>
      </dl>
      {(envelope?.tags?.length ?? 0) > 0 && (
        <div className={analysis.listMeta}>
          {envelope?.tags?.map((tag) => (
            <Badge key={tag} uppercase={false}>
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <Button variant="primary" onClick={() => onOpen(node.ref)}>
        View Entity Details →
      </Button>

      <h2 className={analysis.cardTitle}>Key Evidence ({incidents.length})</h2>
      {incidents.length === 0 && <p className={analysis.muted}>No relations in this graph.</p>}
      <ul className={analysis.rows} data-testid="key-evidence">
        {incidents.slice(0, KEY_EVIDENCE_ROWS).map(({ edge, other, direction }) => (
          <li key={edge.id} className={styles.evidenceRow}>
            <span
              className={styles.relationSwatch}
              style={{ background: colors.families[edgeFamily(edge.type)] }}
              aria-hidden="true"
            />
            <span className={styles.evidenceText}>
              <span className={analysis.listMeta}>
                {direction === 'out' ? (
                  <ArrowRight size={12} aria-label="to" />
                ) : (
                  <ArrowLeft size={12} aria-label="from" />
                )}
                <strong>{edge.type ?? 'path'}</strong>
                {edge.label && <span>{edge.label}</span>}
                {edge.confidence !== undefined && <span>{Math.round(edge.confidence * 100)}%</span>}
              </span>
              <button
                type="button"
                className={analysis.linkButton}
                onClick={() => other && onSelect(other.ref)}
                disabled={!other}
              >
                {other?.title ?? (direction === 'out' ? edge.to : edge.from)}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
