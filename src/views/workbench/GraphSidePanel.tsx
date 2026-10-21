import { useState } from 'react';
import { ArrowLeft, ArrowRight, Link2, Unlink, X } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { createRelation, deleteRelation } from '../../annotations/annotationApi';
import { AnnotationsPanel } from '../../annotations/AnnotationsPanel';
import { canRelate } from '../../annotations/annotationView';
import { RELATION_TYPES, type Relation, type RelationType } from '../../graph/graphApi';
import {
  edgeFamily,
  incidentEdges,
  nodeTime,
  type ViewGraph,
  type ViewNode,
} from '../../graph/graphView';
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
  api?: ForesignalClient | undefined;
  graph: ViewGraph | undefined;
  selected: string | undefined;
  onSelect: (ref: string | undefined) => void;
  /** Opens the object on its own screen (the map's dossier, or its analysis). */
  onOpen: (ref: string) => void;
  /** Called once a relation was drawn or retired here, so the graph is read again. */
  onGraphChanged?: () => void;
}

/** The labels a drawn relation may carry, in the backend's vocabulary (104). */
const RELATION_LABELS: readonly NonNullable<Relation['label']>[] = [
  'confirmed',
  'likely',
  'possible',
  'speculative',
];

/**
 * The right-hand SELECTED ENTITY panel of the workbench (024), from the selected node's envelope
 * as the graph read it: its title, the backend's type, status and severity, summary, first and
 * last times, sources and relations in this graph, tags and View Entity Details. Under it, KEY
 * EVIDENCE lists the relations at the node, the most confident first, each naming the backend's
 * relation type, its direction and label; the object at the other end selects it. When the
 * envelope offers `POST /v1/relations` (026), a relation can be drawn from the node to another in
 * the graph, and an operator relation (not projected) retired. The node's Analysis Notes follow.
 */
export function GraphSidePanel({
  api,
  graph,
  selected,
  onSelect,
  onOpen,
  onGraphChanged,
}: GraphSidePanelProps) {
  const colors = useGraphColors();
  const [problem, setProblem] = useState<string>();
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
  const relating = api !== undefined && canRelate(envelope?.actions);
  /** Runs a relation write, then has the graph read again; a failure is shown. */
  const change = async (run: () => Promise<unknown>): Promise<boolean> => {
    setProblem(undefined);
    try {
      await run();
      onGraphChanged?.();
      return true;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'It was not saved.');
      return false;
    }
  };
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
            {relating && edge.projected === false && (
              <IconButton
                label="Retire this relation"
                icon={<Unlink size={13} />}
                onClick={() => api && void change(() => deleteRelation(api, edge.id))}
              />
            )}
          </li>
        ))}
      </ul>
      {relating && api && (
        <RelationForm
          from={node}
          graph={graph}
          onCreate={(toRef, type, label) =>
            change(() =>
              createRelation(api, {
                fromRef: node.ref,
                toRef,
                type,
                confidence: 1,
                private: false,
                ...(label && { label }),
              }),
            )
          }
        />
      )}
      {problem && (
        <p className={analysis.error} role="alert">
          {problem}
        </p>
      )}
      <AnnotationsPanel api={api} objectRef={node.ref} actions={envelope?.actions} />
    </aside>
  );
}

/**
 * Draws an operator relation from the selected node to another node in the graph: the other
 * object, the relation type and, optionally, a label, each in the backend's words.
 */
function RelationForm({
  from,
  graph,
  onCreate,
}: {
  from: ViewNode;
  graph: ViewGraph;
  onCreate: (
    toRef: string,
    type: RelationType,
    label: NonNullable<Relation['label']> | undefined,
  ) => Promise<boolean>;
}) {
  const others = graph.nodes.filter((entry) => entry.ref !== from.ref);
  const [toRef, setToRef] = useState('');
  const [type, setType] = useState<RelationType>('related-to');
  const [label, setLabel] = useState<NonNullable<Relation['label']> | ''>('');
  const [saving, setSaving] = useState(false);
  const target = others.some((entry) => entry.ref === toRef) ? toRef : '';
  return (
    <form
      className={styles.relationForm}
      aria-label="Draw a relation"
      onSubmit={(event) => {
        event.preventDefault();
        if (!target) return;
        setSaving(true);
        void onCreate(target, type, label || undefined).then((made) => {
          setSaving(false);
          if (made) setToRef('');
        });
      }}
    >
      <h2 className={analysis.cardTitle}>Draw a Relation</h2>
      <select
        className={analysis.select}
        aria-label="Related object"
        value={target}
        onChange={(event) => setToRef(event.target.value)}
      >
        <option value="">Choose an object…</option>
        {others.map((entry) => (
          <option key={entry.ref} value={entry.ref}>
            {entry.title}
          </option>
        ))}
      </select>
      <select
        className={analysis.select}
        aria-label="Relation type"
        value={type}
        onChange={(event) => setType(event.target.value as RelationType)}
      >
        {RELATION_TYPES.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      <select
        className={analysis.select}
        aria-label="Relation label"
        value={label}
        onChange={(event) => setLabel(event.target.value as NonNullable<Relation['label']> | '')}
      >
        <option value="">No label</option>
        {RELATION_LABELS.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      <Button icon={<Link2 size={14} />} type="submit" disabled={!target || saving}>
        Draw relation
      </Button>
    </form>
  );
}
