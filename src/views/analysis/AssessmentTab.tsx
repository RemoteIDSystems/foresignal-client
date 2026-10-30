import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileCode, RefreshCw, X } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { Markdown } from '../../ui/markdown/Markdown';
import { Spinner } from '../../ui/Spinner';
import { Tabs } from '../../ui/Tabs';
import { envelopeAllows, utcText } from '../../intel/analysisView';
import {
  createSituationAssessment,
  getAssessment,
  getAssessmentBundle,
  getCycleRun,
  getPromptTemplate,
  listSituationAssessments,
  type Assessment,
  type CycleRun,
  type PromptTemplate,
} from '../../intel/assessmentApi';
import {
  AI_TABS,
  assessmentOrigin,
  likelihoodText,
  runFinished,
  tabSections,
} from '../../intel/assessmentView';
import { confidenceText, confidenceTone } from '../../intel/hypothesesView';
import { IntelCorroborationPanel } from '../../intel/IntelCorroborationPanel';
import type { Part } from '../../intel/useEvidence';
import { useRead } from '../../intel/useHypotheses';
import { prettifyId } from '../../lib/labels';
import { getObject } from '../../objects/objectApi';
import styles from './Analysis.module.css';

/** How often a re-run's progress is read, in milliseconds. */
export const RUN_POLL_MS = 3_000;

/** How long a re-run is followed before the panel gives up waiting, in milliseconds. */
export const RUN_PATIENCE_MS = 10 * 60_000;

const readList = (api: ForesignalClient, key: string, signal: AbortSignal) =>
  listSituationAssessments(api, key.split('#')[0]!, signal);
const readAssessment = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  getAssessment(api, id, signal);
const readBundle = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  getAssessmentBundle(api, id, signal);

/** A part's loading or failure line, or nothing once it is ready. */
function partNote(part: Part<unknown>, what: string) {
  if (part.status === 'loading') return <p className={styles.muted}>Loading {what}…</p>;
  if (part.status === 'error') return <p className={styles.error}>{part.message}</p>;
  return null;
}

/**
 * The Full Analysis tab (023), as the Conflict mock's AI ANALYSIS: the latest assessment of the
 * situation across Executive Summary, Key Insights, What Changed, Outlook, Risks, Analyst Notes and
 * More; its model, effort, when it was generated and whether a model wrote it (the backend's
 * `textOrigin`); the Key Takeaways (its key judgments, each with its likelihood, confidence and
 * citations); the cited objects (`getAssessmentBundle`), which open; View prompt; and Re-run where
 * the situation's envelope offers `createSituationAssessment`. An investigation has no assessments.
 */
export function AssessmentTab({
  api,
  situationId,
  onOpen,
  notes,
}: {
  api: ForesignalClient | undefined;
  situationId: string | undefined;
  onOpen: (ref: string) => void;
  /** The Analyst Notes tab's content. */
  notes?: ReactNode;
}) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const list = useRead(api, situationId, readList, version);
  const latest = list.status === 'ready' ? list.value[0] : undefined;
  const full = useRead(api, latest?.id, readAssessment);
  const bundle = useRead(api, latest?.id, readBundle);
  if (!situationId) {
    return (
      <p className={styles.muted} data-testid="assessment-tab">
        Assessments are written for situations; an investigation has none of its own.
      </p>
    );
  }
  const assessment = full.status === 'ready' ? full.value : latest;
  return (
    <div className={styles.grid} data-testid="assessment-tab">
      <section className={styles.card} aria-labelledby="ai-title" data-testid="ai-analysis">
        <AssessmentHeader
          api={api}
          situationId={situationId}
          assessment={assessment}
          latestId={latest?.id}
          onRefresh={refresh}
        />
        {partNote(list, 'the assessments')}
        {list.status === 'ready' && !latest && (
          <p className={styles.muted}>No assessment of this situation has been made yet.</p>
        )}
        {assessment && <AssessmentBody assessment={assessment} onOpen={onOpen} notes={notes} />}
      </section>
      {latest && (
        <section className={styles.card} aria-labelledby="cited-title" data-testid="cited-objects">
          <h2 id="cited-title" className={styles.cardTitle}>
            Cited Objects
            {bundle.status === 'ready' ? ` (${bundle.value.objects.length})` : ''}
          </h2>
          {partNote(bundle, 'the cited objects')}
          {bundle.status === 'ready' && bundle.value.objects.length === 0 && (
            <p className={styles.muted}>This assessment cites no objects.</p>
          )}
          <ul className={styles.rows} aria-label="Cited objects">
            {(bundle.status === 'ready' ? bundle.value.objects : []).map((object) => (
              <li key={object.ref} className={styles.row}>
                <button
                  type="button"
                  className={styles.rowButton}
                  onClick={() => onOpen(object.ref)}
                >
                  <span className={styles.rowDay}>{prettifyId(object.envelope.type)}</span>
                  <span className={styles.rowTitle}>{object.envelope.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {api && <IntelCorroborationPanel api={api} />}
    </div>
  );
}

/**
 * The AI Analysis header: the title, the model, effort, generated time, cadence, status and text
 * origin; View prompt; and Re-run with its progress.
 */
function AssessmentHeader({
  api,
  situationId,
  assessment,
  latestId,
  onRefresh,
}: {
  api: ForesignalClient | undefined;
  situationId: string;
  assessment: Assessment | undefined;
  latestId: string | undefined;
  onRefresh: () => void;
}) {
  const [canRerun, setCanRerun] = useState(false);
  const [prompts, setPrompts] = useState(false);
  const rerun = useRerun(api, situationId, latestId, onRefresh);
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    getObject(api, `situation:${situationId}`, undefined, controller.signal).then(
      (envelope) =>
        !controller.signal.aborted &&
        setCanRerun(envelopeAllows(envelope.actions, 'POST', /\/situations\/[^/]+\/assessment$/)),
      () => !controller.signal.aborted && setCanRerun(false),
    );
    return () => controller.abort();
  }, [api, situationId]);
  return (
    <>
      <div className={styles.drawerHead}>
        <h2 id="ai-title" className={styles.cardTitle}>
          AI Analysis
        </h2>
        <div className={styles.actions}>
          {assessment && (assessment.promptTemplates?.length ?? 0) > 0 && (
            <Button icon={<FileCode size={14} />} onClick={() => setPrompts(true)}>
              View prompt
            </Button>
          )}
          {canRerun && (
            <Button
              icon={<RefreshCw size={14} />}
              disabled={rerun.state === 'running'}
              onClick={() => void rerun.start()}
            >
              Re-run
            </Button>
          )}
        </div>
      </div>
      {assessment && (
        <dl className={styles.facts} data-testid="assessment-meta">
          <dt>Model</dt>
          <dd>
            {assessment.model ?? 'none'}
            {assessment.effort ? ` (effort ${assessment.effort})` : ''}
          </dd>
          <dt>Generated</dt>
          <dd>{utcText(assessment.createdAt)}</dd>
          <dt>Cadence</dt>
          <dd>{assessment.cadence}</dd>
          <dt>Status</dt>
          <dd>{assessment.status}</dd>
          <dt>Text origin</dt>
          <dd>
            <Badge
              tone={assessmentOrigin(assessment) === 'deterministic' ? 'neutral' : 'violet'}
              uppercase={false}
            >
              {assessmentOrigin(assessment)}
            </Badge>
          </dd>
        </dl>
      )}
      {rerun.state === 'running' && (
        <p className={styles.muted} data-testid="rerun-progress">
          <Spinner /> Assessing{rerun.run ? ` (${rerun.run.status})` : ''}…
        </p>
      )}
      {rerun.message && (
        <p className={rerun.state === 'failed' ? styles.error : styles.muted} role="status">
          {rerun.message}
        </p>
      )}
      {prompts && api && assessment && (
        <PromptDrawer api={api} assessment={assessment} onClose={() => setPrompts(false)} />
      )}
    </>
  );
}

/** What a re-run is doing. */
interface Rerun {
  state: 'idle' | 'running' | 'done' | 'failed';
  run?: CycleRun;
  message?: string;
  start: () => Promise<void>;
}

/**
 * Starts an on-demand assessment and follows it: its run (`getCycleRun`) every
 * {@link RUN_POLL_MS} until it finishes, then the list is read again. Where the run cannot be
 * read, the list is read instead until a newer assessment appears. It gives up after
 * {@link RUN_PATIENCE_MS}.
 */
function useRerun(
  api: ForesignalClient | undefined,
  situationId: string,
  latestId: string | undefined,
  onRefresh: () => void,
): Rerun {
  const [state, setState] = useState<Omit<Rerun, 'start'>>({ state: 'idle' });
  const [startedWith, setStartedWith] = useState<string | undefined>();
  // When the run began, and whether its progress could not be read; kept across polls.
  const begun = useRef(0);
  const blind = useRef(false);
  const runId = state.run?.id;
  useEffect(() => {
    if (state.state !== 'running' || !api || !runId) return;
    const timer = window.setInterval(() => {
      if (Date.now() - begun.current > RUN_PATIENCE_MS) {
        setState({ state: 'failed', message: 'The assessment is taking long; check back later.' });
        return;
      }
      if (blind.current) {
        onRefresh();
        return;
      }
      getCycleRun(api, runId).then(
        (run) => {
          if (!runFinished(run)) {
            setState((current) => ({ ...current, run }));
            return;
          }
          onRefresh();
          setState(
            run.status === 'failed'
              ? { state: 'failed', run, message: run.error ?? 'The assessment failed.' }
              : { state: 'done', run, message: `Assessment ${run.status}.` },
          );
        },
        () => {
          blind.current = true;
        },
      );
    }, RUN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [api, state.state, runId, onRefresh]);
  // Following blind: a newer assessment at the top of the list means the run finished.
  if (
    state.state === 'running' &&
    startedWith !== undefined &&
    latestId &&
    latestId !== startedWith
  ) {
    setStartedWith(undefined);
    setState({ state: 'done', message: 'A new assessment is in.' });
  }
  const start = async () => {
    if (!api) return;
    setStartedWith(latestId ?? '');
    begun.current = Date.now();
    blind.current = false;
    setState({ state: 'running' });
    try {
      const run = await createSituationAssessment(api, situationId);
      setState({ state: 'running', run });
    } catch (failure) {
      setState({
        state: 'failed',
        message: failure instanceof Error ? failure.message : 'The assessment was not started.',
      });
    }
  };
  return { ...state, start };
}

/** The assessment's tabs and their content. */
function AssessmentBody({
  assessment,
  onOpen,
  notes,
}: {
  assessment: Assessment;
  onOpen: (ref: string) => void;
  notes?: ReactNode;
}) {
  const [tab, setTab] = useState<string>(AI_TABS[0]!.key);
  const open = AI_TABS.find((t) => t.key === tab) ?? AI_TABS[0]!;
  const sections = tabSections(assessment, open);
  return (
    <>
      <Tabs
        items={AI_TABS.map((t) => ({ key: t.key, label: t.label }))}
        value={open.key}
        onChange={setTab}
        label="AI Analysis sections"
        variant="boxed"
      />
      <div data-testid="ai-tab" data-tab={open.key}>
        {open.key === 'notes' ? (
          (notes ?? <p className={styles.muted}>No analyst notes.</p>)
        ) : (
          <>
            {sections.length === 0 && open.key !== 'summary' && (
              <p className={styles.muted}>This assessment has no {open.label} section.</p>
            )}
            {sections.map((section) => (
              <div key={section.key} className={styles.section} data-section={section.key}>
                {open.sections.length > 1 && <h3 className={styles.cardTitle}>{section.title}</h3>}
                <Badge
                  tone={section.textOrigin === 'deterministic' ? 'neutral' : 'violet'}
                  uppercase={false}
                >
                  {section.textOrigin}
                </Badge>
                <Markdown source={section.markdown} onRef={onOpen} />
              </div>
            ))}
            {open.key === 'summary' && <KeyTakeaways assessment={assessment} onOpen={onOpen} />}
          </>
        )}
      </div>
      {assessment.lintWarnings && assessment.lintWarnings.length > 0 && (
        <p className={styles.muted}>Warnings: {assessment.lintWarnings.join('; ')}</p>
      )}
      {assessment.footer && <p className={styles.muted}>{assessment.footer}</p>}
    </>
  );
}

/**
 * The Key Takeaways: the assessment's key judgments numbered, each with its text, likelihood,
 * confidence (the backend's word), text origin, what changed, and its citations, which open.
 */
function KeyTakeaways({
  assessment,
  onOpen,
}: {
  assessment: Assessment;
  onOpen: (ref: string) => void;
}) {
  if (assessment.bluf.length === 0) return null;
  return (
    <>
      <h3 className={styles.cardTitle}>Key Takeaways</h3>
      <ol className={styles.takeaways} aria-label="Key takeaways">
        {assessment.bluf.map((judgment, i) => {
          const likelihood = likelihoodText(judgment);
          return (
            <li key={judgment.id ?? i} className={styles.takeaway} data-testid="takeaway">
              <span className={styles.takeawayNumber}>{i + 1}</span>
              <span className={styles.hypothesisText}>
                <span>{judgment.text}</span>
                <span className={styles.listMeta}>
                  {likelihood && <strong>{likelihood}</strong>}
                  {judgment.confidence && (
                    <span>
                      Confidence:{' '}
                      <Badge tone={confidenceTone(judgment.confidence)} uppercase={false}>
                        {confidenceText(judgment.confidence)}
                      </Badge>
                    </span>
                  )}
                  <Badge
                    tone={judgment.textOrigin === 'llm' ? 'violet' : 'neutral'}
                    uppercase={false}
                  >
                    {judgment.textOrigin}
                  </Badge>
                  {judgment.downgraded && <Badge tone="warning">downgraded</Badge>}
                </span>
                {judgment.confidenceStatement && (
                  <span className={styles.muted}>{judgment.confidenceStatement}</span>
                )}
                {judgment.change && (
                  <span className={styles.muted}>Changed: {judgment.change.explanation}</span>
                )}
                {judgment.citations.length > 0 && (
                  <span className={styles.listMeta}>
                    {judgment.citations.map((ref) => (
                      <button
                        key={ref}
                        type="button"
                        className={styles.linkButton}
                        onClick={() => onOpen(ref)}
                      >
                        {ref}
                      </button>
                    ))}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** The prompt templates an assessment was written with (`getPromptTemplate`), beside the panel. */
function PromptDrawer({
  api,
  assessment,
  onClose,
}: {
  api: ForesignalClient;
  assessment: Assessment;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<Part<PromptTemplate[]>>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      (assessment.promptTemplates ?? []).map((t) =>
        getPromptTemplate(api, t.id, t.version, controller.signal),
      ),
    ).then(
      (value) => !controller.signal.aborted && setTemplates({ status: 'ready', value }),
      (error: unknown) =>
        !controller.signal.aborted &&
        setTemplates({
          status: 'error',
          message: error instanceof Error ? error.message : 'The prompts did not load.',
        }),
    );
    return () => controller.abort();
  }, [api, assessment]);
  return (
    <aside className={styles.drawer} aria-label="Prompt" data-testid="prompt-drawer">
      <div className={styles.drawerHead}>
        <h2 className={styles.cardTitle}>Prompt templates</h2>
        <IconButton label="Close prompt" icon={<X size={15} />} onClick={onClose} />
      </div>
      <p className={styles.muted}>
        The versioned templates the model was given; the filled-in prompt is not exposed.
      </p>
      {partNote(templates, 'the prompts')}
      {(templates.status === 'ready' ? templates.value : []).map((template) => (
        <div key={`${template.id}@${template.version}`} className={styles.section}>
          <h3 className={styles.cardTitle}>
            {template.id}@{template.version}
            {template.role ? ` · ${template.role}` : ''}
          </h3>
          <pre className={styles.prompt}>{template.text}</pre>
        </div>
      ))}
    </aside>
  );
}
