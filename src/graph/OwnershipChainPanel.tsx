import { useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { useCan } from '../auth/permissions';
import { prettifyId } from '../lib/labels';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ownershipChain, type OwnershipChainNode, type OwnershipDirection } from './ownershipApi';
import analysis from '../views/analysis/Analysis.module.css';

/** The tone for an edge's confidence label (104 vocabulary). */
const LABEL_TONE: Record<string, BadgeTone> = {
  confirmed: 'success',
  likely: 'info',
  possible: 'warning',
  speculative: 'danger',
};

/** The direction options the walk offers. */
const DIRECTIONS: readonly { value: OwnershipDirection; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'out', label: 'What it owns' },
  { value: 'in', label: 'Who owns it' },
];

/** One reached entity, its weakest-edge label, and the relation types on the path to it. */
function ChainNode({
  chain,
  onOpen,
}: {
  chain: OwnershipChainNode;
  onOpen: (ref: string) => void;
}) {
  const edges = Array.from(new Set(chain.paths.flatMap((path) => path.relationTypes ?? [])));
  return (
    <li className={analysis.row}>
      <button type="button" className={analysis.rowButton} onClick={() => onOpen(chain.node.ref)}>
        <span className={analysis.rowTitle}>{chain.node.title}</span>
        <span className={analysis.muted}>
          {prettifyId(chain.node.type)}
          {edges.length ? ` · ${edges.join(', ')}` : ''}
        </span>
      </button>
      <Badge tone={LABEL_TONE[chain.weakestEdgeLabel] ?? 'neutral'} uppercase={false}>
        {chain.weakestEdgeLabel}
      </Badge>
    </li>
  );
}

/**
 * The ownership-chain enrichment (R2-011): from a selected entity, walk its ownership / affiliation
 * chain (`ownershipChain`) and list every reached entity as a linked node, each opening on click.
 * Entities reached from two or more seeds are not relevant here (one seed), so only `chains` is
 * shown. Gated `data.read`; renders nothing without it.
 */
export function OwnershipChainPanel({
  api,
  seedRef,
  onOpen,
}: {
  api: ForesignalClient | undefined;
  seedRef: string;
  onOpen: (ref: string) => void;
}) {
  const can = useCan();
  const [direction, setDirection] = useState<OwnershipDirection>('both');
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ready'; chains: OwnershipChainNode[] }
    | { kind: 'error' }
  >({ kind: 'idle' });

  if (!can('data.read') || !api) return null;

  const run = async () => {
    setState({ kind: 'loading' });
    try {
      const result = await ownershipChain(api, [seedRef], { direction });
      setState({ kind: 'ready', chains: result.chains });
    } catch {
      setState({ kind: 'error' });
    }
  };

  return (
    <section aria-label="Ownership chain">
      <h3 className={analysis.cardTitle}>Ownership chain</h3>
      <div className={analysis.actions}>
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value as OwnershipDirection)}
          aria-label="Ownership direction"
        >
          {DIRECTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="button" disabled={state.kind === 'loading'} onClick={() => void run()}>
          {state.kind === 'loading' ? 'Walking…' : 'Expand ownership chain'}
        </Button>
      </div>
      {state.kind === 'error' && (
        <p className={analysis.muted}>The ownership chain did not load.</p>
      )}
      {state.kind === 'ready' &&
        (state.chains.length === 0 ? (
          <p className={analysis.muted}>No ownership or affiliation chain from this entity.</p>
        ) : (
          <ul className={analysis.rows} aria-label="Reached entities">
            {state.chains.map((chain) => (
              <ChainNode key={chain.node.ref} chain={chain} onOpen={onOpen} />
            ))}
          </ul>
        ))}
    </section>
  );
}
