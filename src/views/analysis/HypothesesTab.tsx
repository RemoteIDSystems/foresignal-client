import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { envelopeAllows, utcText } from '../../intel/analysisView';
import {
  addHypothesis,
  getAchMatrix,
  getHypothesisSet,
  getInformationValue,
  listIndicators,
  type AchMatrix,
  type HypothesisSet,
  type Indicator,
  type InformationValue,
} from '../../intel/hypothesisApi';
import {
  confidenceText,
  confidenceTone,
  indicatorCounts,
  isNonDiagnostic,
  matrixRows,
  primarySet,
  priorText,
  probabilityTone,
  rankedHypotheses,
  rankedIndicators,
  RATING_TEXT,
  ratingTone,
  trendArrow,
  trendText,
} from '../../intel/hypothesesView';
import type { Part } from '../../intel/useEvidence';
import { useRead } from '../../intel/useHypotheses';
import { prettifyId } from '../../lib/labels';
import { getObject } from '../../objects/objectApi';
import styles from './Analysis.module.css';

const readSet = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  getHypothesisSet(api, id, signal);
const readIndicators = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  listIndicators(api, { setId: id }, signal);
const readValue = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  getInformationValue(api, id, signal);
const readMatrix = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  getAchMatrix(api, id, signal);

/** A part's loading or failure line, or nothing once it is ready. */
function partNote(part: Part<unknown>, what: string) {
  if (part.status === 'loading') return <p className={styles.muted}>Loading {what}…</p>;
  if (part.status === 'error') return <p className={styles.error}>{part.message}</p>;
  return null;
}

/**
 * The Hypotheses tab (021), as the Conflict mock's COMPETING HYPOTHESES: the open set's hypotheses
 * H1…Hn, most probable first, each with its probability and trend, its indicators and its
 * confidence; the pending indicators ranked by information value; the indicators and key
 * assumptions; and "View hypothesis analysis", the set's ACH matrix. A situation shows its linked
 * sets, an investigation the sets it links; with several, a chooser picks one.
 */
export function HypothesesTab({
  api,
  sets,
  onOpen,
}: {
  api: ForesignalClient | undefined;
  sets: Part<HypothesisSet[]>;
  onOpen: (ref: string) => void;
}) {
  const [chosen, setChosen] = useState<string>();
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [version, setVersion] = useState(0);
  const list = sets.status === 'ready' ? sets.value : [];
  const summary = list.find((set) => set.id === chosen) ?? primarySet(list);
  const id = summary?.id;
  const detail = useRead(api, id, readSet, version);
  const indicators = useRead(api, id, readIndicators, version);
  const value = useRead(api, id, readValue, version);
  const set = detail.status === 'ready' ? detail.value : summary;

  if (sets.status !== 'ready') return partNote(sets, 'the hypothesis sets');
  if (!set) {
    return (
      <p className={styles.muted} data-testid="hypotheses-tab">
        No hypothesis sets are linked to this analysis.
      </p>
    );
  }
  const chooser =
    list.length > 1 ? (
      <label>
        <span className={styles.visuallyHidden}>Key question</span>
        <select
          className={styles.select}
          value={set.id}
          onChange={(event) => {
            setChosen(event.target.value);
            setView('list');
          }}
        >
          {list.map((one) => (
            <option key={one.id} value={one.id}>
              {one.question}
            </option>
          ))}
        </select>
      </label>
    ) : null;
  if (view === 'matrix' && api) {
    return (
      <AchMatrixView
        api={api}
        set={set}
        version={version}
        onBack={() => setView('list')}
        onOpen={onOpen}
      />
    );
  }
  return (
    <div className={styles.grid} data-testid="hypotheses-tab">
      <HypothesesPanel
        api={api}
        set={set}
        indicators={indicators.status === 'ready' ? indicators.value : []}
        chooser={chooser}
        onAdded={() => setVersion((v) => v + 1)}
        onMatrix={() => setView('matrix')}
      />
      <InformationValuePanel value={value} />
      <IndicatorsPanel indicators={indicators} />
      {set.assumptions && set.assumptions.length > 0 && (
        <section className={styles.card} aria-labelledby="assumptions-title">
          <h2 id="assumptions-title" className={styles.cardTitle}>
            Key Assumptions
          </h2>
          <ul className={styles.rows}>
            {set.assumptions.map((assumption) => (
              <li key={assumption.id} className={styles.findingRow}>
                <span className={styles.titleRow}>
                  {assumption.linchpin && <Badge tone="warning">Linchpin</Badge>}
                  <Badge tone={assumption.status === 'broken' ? 'danger' : 'neutral'}>
                    {assumption.status}
                  </Badge>
                </span>
                <span>{assumption.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The competing hypotheses of a set: the question, its kind, cadence, horizon and confidence; a
 * row per hypothesis (H1…Hn by probability) with its statement, prior, `Indicators: x/y` with the
 * observed ones for and against, its confidence, and the probability pill with its trend. "+ Add
 * hypothesis" shows when the set's envelope offers `addHypothesis`.
 */
export function HypothesesPanel({
  api,
  set,
  indicators,
  chooser,
  onAdded,
  onMatrix,
}: {
  api: ForesignalClient | undefined;
  set: HypothesisSet;
  indicators: readonly Indicator[];
  chooser?: ReactNode;
  onAdded: () => void;
  onMatrix: () => void;
}) {
  const [canAdd, setCanAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    getObject(api, `hypothesis-set:${set.id}`, undefined, controller.signal).then(
      (envelope) =>
        !controller.signal.aborted &&
        setCanAdd(
          envelopeAllows(envelope.actions, 'POST', /\/hypotheses\/sets\/[^/]+\/hypotheses$/),
        ),
      () => !controller.signal.aborted && setCanAdd(false),
    );
    return () => controller.abort();
  }, [api, set.id]);
  const rows = useMemo(() => rankedHypotheses(set), [set]);
  return (
    <section
      className={styles.card}
      aria-labelledby="hypotheses-title"
      data-testid="hypotheses-panel"
    >
      <div className={styles.drawerHead}>
        <h2 id="hypotheses-title" className={styles.cardTitle}>
          Competing Hypotheses
        </h2>
        {canAdd && !adding && (
          <Button icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add hypothesis
          </Button>
        )}
      </div>
      {chooser}
      <p className={styles.text}>{set.question}</p>
      <div className={styles.listMeta}>
        <Badge tone="neutral">{set.kind}</Badge>
        <span>
          Reviewed {set.cadence}
          {set.horizon ? ` · horizon ${set.horizon}` : ''}
          {set.lastRevisionAt ? ` · revised ${utcText(set.lastRevisionAt)}` : ''}
        </span>
        <span>
          Confidence:{' '}
          <Badge tone={confidenceTone(set.confidence)} uppercase={false}>
            {confidenceText(set.confidence)}
          </Badge>
        </span>
        {set.reviewFlagged && <Badge tone="warning">Review flagged</Badge>}
      </div>
      {adding && api && (
        <AddHypothesisForm
          api={api}
          setId={set.id}
          onDone={(added) => {
            setAdding(false);
            if (added) onAdded();
          }}
        />
      )}
      {rows.length === 0 && <p className={styles.muted}>This set has no hypotheses yet.</p>}
      <ul className={styles.rows} aria-label="Hypotheses">
        {rows.map(({ hypothesis, tag }) => {
          const counts = indicatorCounts(hypothesis, indicators);
          const arrow = trendArrow(hypothesis);
          return (
            <li
              key={hypothesis.id}
              className={styles.hypothesisRow}
              data-testid="hypothesis-row"
              data-status={hypothesis.status}
            >
              <span className={styles.hypothesisText}>
                <span className={styles.titleRow}>
                  <strong>{tag}</strong>
                  <span>{hypothesis.label}</span>
                  {hypothesis.status !== 'open' && (
                    <Badge tone={hypothesis.status === 'confirmed' ? 'success' : 'neutral'}>
                      {hypothesis.status}
                    </Badge>
                  )}
                </span>
                <span className={styles.clamp}>{hypothesis.statement}</span>
                <span className={styles.listMeta}>
                  {counts.total > 0 && (
                    <span data-testid="hypothesis-indicators">
                      Indicators: {counts.observed}/{counts.total}
                      {counts.observed > 0 &&
                        ` (${counts.supporting} for, ${counts.contradicting} against)`}
                    </span>
                  )}
                  <span>
                    Confidence:{' '}
                    <Badge tone={confidenceTone(hypothesis.confidence)} uppercase={false}>
                      {confidenceText(hypothesis.confidence)}
                    </Badge>
                  </span>
                  <span>
                    {prettifyId(hypothesis.estimativeTerm)}, {priorText(hypothesis)}
                  </span>
                </span>
              </span>
              <span title={trendText(hypothesis)} data-testid="hypothesis-probability">
                <Badge kind="count" tone={probabilityTone(hypothesis.probability)}>
                  {Math.round(hypothesis.probability * 100)}%{arrow && ` ${arrow}`}
                </Badge>
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" className={styles.linkButton} onClick={onMatrix}>
        View hypothesis analysis →
      </button>
    </section>
  );
}

/**
 * Adds a hypothesis (`addHypothesis`): a label, the statement, and the prior with the analyst's
 * rationale (an operator basis). The backend renormalizes an exclusive set and records a revision.
 */
function AddHypothesisForm({
  api,
  setId,
  onDone,
}: {
  api: ForesignalClient;
  setId: string;
  onDone: (added: boolean) => void;
}) {
  const [label, setLabel] = useState('');
  const [statement, setStatement] = useState('');
  const [prior, setPrior] = useState('10');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const priorValue = Number(prior);
  const valid =
    label.trim() !== '' &&
    statement.trim() !== '' &&
    Number.isFinite(priorValue) &&
    priorValue >= 0 &&
    priorValue <= 100;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(undefined);
    try {
      await addHypothesis(api, setId, {
        label: label.trim(),
        statement: statement.trim(),
        type: 'outcome',
        prior: priorValue / 100,
        priorBasis: { type: 'operator', rationale: rationale.trim() || null },
      });
      onDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The hypothesis was not added.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={styles.form} aria-label="Add hypothesis" onSubmit={(e) => void submit(e)}>
      <input
        className={styles.input}
        aria-label="Label"
        placeholder="Label"
        maxLength={80}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <input
        className={styles.input}
        aria-label="Statement"
        placeholder="Statement"
        maxLength={2000}
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
      />
      <input
        className={styles.input}
        aria-label="Prior (%)"
        type="number"
        min={0}
        max={100}
        value={prior}
        onChange={(e) => setPrior(e.target.value)}
      />
      <input
        className={styles.input}
        aria-label="Rationale"
        placeholder="Rationale for the prior (optional)"
        maxLength={2000}
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
      <Button type="submit" variant="primary" disabled={busy || !valid}>
        Add
      </Button>
      <Button onClick={() => onDone(false)}>Cancel</Button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Pending indicators ranked by expected information gain (`getInformationValue`): which to watch
 * first. Each shows its family, gain, detection chance, and a Collection gap tag when it would rank
 * in the top three if it were fully observable.
 */
export function InformationValuePanel({ value }: { value: Part<InformationValue> }) {
  return (
    <section
      className={styles.card}
      aria-labelledby="information-title"
      data-testid="information-value"
    >
      <h2 id="information-title" className={styles.cardTitle}>
        Information Value
      </h2>
      {partNote(value, 'the information value')}
      {value.status === 'ready' && (
        <>
          <p className={styles.muted}>
            Uncertainty now {value.value.entropy.toFixed(2)} nats · computed{' '}
            {utcText(value.value.computedAt)}
          </p>
          {value.value.indicators.length === 0 && (
            <p className={styles.muted}>No indicators are pending.</p>
          )}
          <ol className={styles.rows} aria-label="Pending indicators by information value">
            {rankedIndicators(value.value).map((indicator) => (
              <li key={indicator.indicatorId} className={styles.findingRow}>
                <span className={styles.titleRow}>
                  <strong>#{indicator.rank}</strong>
                  <span>{indicator.description ?? indicator.indicatorId}</span>
                  {indicator.collectionGap && <Badge tone="orange">Collection gap</Badge>}
                </span>
                <span className={styles.listMeta}>
                  {indicator.signalFamily && <Badge tone="neutral">{indicator.signalFamily}</Badge>}
                  <span>Gain {indicator.eig.toFixed(3)} nats</span>
                  <span>(up to {indicator.potentialEig.toFixed(3)} if fully observable)</span>
                  {indicator.pDetect !== null && indicator.pDetect !== undefined && (
                    <span>Detection {Math.round(indicator.pDetect * 100)}%</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** A set's indicators (`listIndicators`): each one's state, family, description and due date. */
export function IndicatorsPanel({ indicators }: { indicators: Part<Indicator[]> }) {
  const list = indicators.status === 'ready' ? indicators.value : [];
  return (
    <section className={styles.card} aria-labelledby="indicators-title" data-testid="indicators">
      <h2 id="indicators-title" className={styles.cardTitle}>
        Indicators{indicators.status === 'ready' ? ` (${list.length})` : ''}
      </h2>
      {partNote(indicators, 'the indicators')}
      {indicators.status === 'ready' && list.length === 0 && (
        <p className={styles.muted}>This set has no indicators.</p>
      )}
      <ul className={styles.rows} aria-label="Indicators">
        {list.map((indicator) => (
          <li key={indicator.id} className={styles.findingRow} data-state={indicator.state}>
            <span className={styles.titleRow}>
              <Badge
                tone={
                  indicator.state === 'observed'
                    ? 'success'
                    : indicator.state === 'emerging'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {indicator.state}
              </Badge>
              <span>{indicator.description}</span>
            </span>
            <span className={styles.listMeta}>
              <Badge tone="neutral">{indicator.signalFamily}</Badge>
              {indicator.expectedBy && <span>Expected by {utcText(indicator.expectedBy)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The ACH matrix (`getAchMatrix`): the evidence rows (heaviest first) against the hypotheses, each
 * cell the row's consistency rating; the weighted inconsistency score per hypothesis, the least
 * inconsistent marked; non-diagnostic rows and circular reporting tagged; the backend's note that
 * this is an audit view.
 */
export function AchMatrixView({
  api,
  set,
  version,
  onBack,
  onOpen,
}: {
  api: ForesignalClient;
  set: HypothesisSet;
  version: number;
  onBack: () => void;
  onOpen: (ref: string) => void;
}) {
  const matrix = useRead(api, set.id, readMatrix, version);
  const tags = useMemo(
    () => new Map(rankedHypotheses(set).map(({ hypothesis, tag }) => [hypothesis.id, tag])),
    [set],
  );
  return (
    <section className={styles.card} aria-labelledby="matrix-title" data-testid="ach-matrix">
      <div className={styles.drawerHead}>
        <h2 id="matrix-title" className={styles.cardTitle}>
          Hypothesis Analysis (ACH)
        </h2>
        <Button icon={<ArrowLeft size={14} />} onClick={onBack}>
          Hypotheses
        </Button>
      </div>
      <p className={styles.text}>{set.question}</p>
      {partNote(matrix, 'the matrix')}
      {matrix.status === 'ready' && (
        <MatrixTable matrix={matrix.value} tags={tags} onOpen={onOpen} />
      )}
    </section>
  );
}

/** The matrix itself, with its key. */
function MatrixTable({
  matrix,
  tags,
  onOpen,
}: {
  matrix: AchMatrix;
  tags: ReadonlyMap<string, string>;
  onOpen: (ref: string) => void;
}) {
  const rows = matrixRows(matrix);
  const least = matrix.leastInconsistentHypothesisId;
  return (
    <>
      <p className={styles.muted}>
        {matrix.note ?? 'Audit view: probabilities come from the updater.'} Computed{' '}
        {utcText(matrix.computedAt)}.
      </p>
      {rows.length === 0 ? (
        <p className={styles.muted}>No evidence has been rated against these hypotheses yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="ACH matrix">
            <thead>
              <tr>
                <th>Evidence</th>
                <th>Credibility / relevance</th>
                <th>Weight</th>
                {matrix.hypotheses.map((h) => (
                  <th key={h.id} title={h.label} data-least={h.id === least || undefined}>
                    {tags.get(h.id) ?? h.label} · {Math.round(h.probability * 100)}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid="ach-row">
                  <td>
                    <span className={styles.hypothesisText}>
                      {row.ref && row.ref.includes(':') ? (
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => onOpen(row.ref!)}
                        >
                          {row.description}
                        </button>
                      ) : (
                        <span>{row.description}</span>
                      )}
                      <span className={styles.listMeta}>
                        <Badge tone="neutral">{prettifyId(row.source)}</Badge>
                        {isNonDiagnostic(matrix, row) && (
                          <Badge tone="neutral">Non-diagnostic</Badge>
                        )}
                        {row.caveats?.includes('CIRCULAR_REPORTING') && (
                          <Badge tone="warning">Circular reporting</Badge>
                        )}
                      </span>
                    </span>
                  </td>
                  <td>
                    {row.credibility} / {row.relevance}
                  </td>
                  <td>{row.weight ?? '—'}</td>
                  {matrix.hypotheses.map((h) => {
                    const rating = row.ratings[h.id];
                    return (
                      <td key={h.id} title={rating ? RATING_TEXT[rating] : 'Not rated'}>
                        {rating ? (
                          <Badge tone={ratingTone(rating)} uppercase={false}>
                            {rating}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr data-testid="ach-scores">
                <th colSpan={3}>Inconsistency (weighted)</th>
                {matrix.hypotheses.map((h) => (
                  <td key={h.id} data-least={h.id === least || undefined}>
                    {(matrix.scores[h.id] ?? h.inconsistencyScore).toFixed(1)}
                    {h.id === least && (
                      <>
                        {' '}
                        <Badge tone="success" uppercase={false}>
                          Least inconsistent
                        </Badge>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className={styles.muted}>
        {Object.entries(RATING_TEXT)
          .map(([code, text]) => `${code} ${text.toLowerCase()}`)
          .join(' · ')}
      </p>
    </>
  );
}
