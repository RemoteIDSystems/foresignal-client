import { useMemo, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { useTheme } from '../../app/theme';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { EChart } from '../../ui/charts/EChart';
import { reliabilityOption, timeSeriesOption } from '../../ui/charts/chartOptions';
import { Sparkline } from '../../ui/Sparkline';
import { Tabs } from '../../ui/Tabs';
import { utcText } from '../../intel/analysisView';
import {
  getForecastCalibration,
  getForecastQuestion,
  getForecastQuestionHistory,
  getForecastScorecard,
  isNumericCalibration,
  listForecastQuestions,
  listForecasts,
  type ForecastNumericCalibration,
  type QuestionSummary,
} from '../../intel/forecastApi';
import { IntelCalibrationPanel } from '../../intel/IntelCalibrationPanel';
import {
  calibrationCurve,
  DEFAULT_HORIZON,
  dueQuestions,
  forecastText,
  historyLines,
  HORIZONS,
  horizonEnd,
  latestByForecaster,
  levelTone,
  pillTone,
  probabilityText,
  reliabilityBins,
  scorecardRows,
  scoreText,
  trendArrow,
  trendLevel,
  trendSeries,
  trendValues,
  type QuestionScope,
} from '../../intel/forecastsView';
import type { Part } from '../../intel/useEvidence';
import { useRead } from '../../intel/useHypotheses';
import { prettifyId } from '../../lib/labels';
import styles from './Analysis.module.css';

/** How many questions show before "Show all". */
export const QUESTION_ROWS = 20;

/** Reads the questions of a scope that resolve before a horizon's end (the key, as JSON). */
const readQuestions = async (api: ForesignalClient, key: string, signal: AbortSignal) => {
  const { scope, end } = JSON.parse(key) as { scope: QuestionScope; end: string };
  const questions =
    'linked' in scope
      ? await listForecastQuestions(api, { linked: scope.linked, dueBefore: end }, signal)
      : await Promise.all(scope.questionIds.map((id) => getForecastQuestion(api, id, signal)));
  return dueQuestions(questions, end);
};
const readHistory = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  getForecastQuestionHistory(api, id, signal);
const readQuestion = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  getForecastQuestion(api, id, signal);
const readForecasts = (api: ForesignalClient, id: string, signal: AbortSignal) =>
  listForecasts(api, id, signal);
const readScorecard = (api: ForesignalClient, _key: string, signal: AbortSignal) =>
  getForecastScorecard(api, signal);
const readCalibration = (api: ForesignalClient, _key: string, signal: AbortSignal) =>
  getForecastCalibration(api, signal);

/** A part's loading or failure line, or nothing once it is ready. */
function partNote(part: Part<unknown>, what: string) {
  if (part.status === 'loading') return <p className={styles.muted}>Loading {what}…</p>;
  if (part.status === 'error') return <p className={styles.error}>{part.message}</p>;
  return null;
}

/**
 * The Forecasts tab (022), as the Conflict mock's FORECASTS & PREDICTIONS: the open ledger
 * questions about the analysis that resolve within the chosen horizon, each with its ensemble
 * probability, ICD-203 term, date and trend; a question opens its history and forecasters; "View
 * forecast ledger" opens the scorecard and calibration curve.
 */
export function ForecastsTab({
  api,
  scope,
}: {
  api: ForesignalClient | undefined;
  scope: QuestionScope;
}) {
  const [view, setView] = useState<'list' | 'ledger'>('list');
  if (view === 'ledger' && api) return <LedgerView api={api} onBack={() => setView('list')} />;
  return <ForecastsPanel api={api} scope={scope} onLedger={() => setView('ledger')} />;
}

/**
 * The questions panel: the horizon selector, a row per question (title and date, the
 * probability pill with its trend arrow, a sparkline colored by level), the legend, and "View
 * forecast ledger". A question's title opens its detail beside the list.
 */
export function ForecastsPanel({
  api,
  scope,
  onLedger,
}: {
  api: ForesignalClient | undefined;
  scope: QuestionScope;
  onLedger: () => void;
}) {
  const [horizon, setHorizon] = useState<string>(DEFAULT_HORIZON.key);
  const [now] = useState(() => Date.now());
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<QuestionSummary>();
  const months = (HORIZONS.find((h) => h.key === horizon) ?? DEFAULT_HORIZON).months;
  const key = JSON.stringify({ scope, end: horizonEnd(months, now) });
  const questions = useRead(api, key, readQuestions);
  const list = questions.status === 'ready' ? questions.value : [];
  const shown = all ? list : list.slice(0, QUESTION_ROWS);
  return (
    <div className={styles.grid} data-testid="forecasts-tab">
      <section
        className={styles.card}
        aria-labelledby="forecasts-title"
        data-testid="forecasts-panel"
      >
        <h2 id="forecasts-title" className={styles.cardTitle}>
          Forecasts &amp; Predictions
        </h2>
        <Tabs
          items={HORIZONS.map((h) => ({ key: h.key, label: h.label }))}
          value={horizon}
          onChange={(next) => {
            setHorizon(next);
            setAll(false);
          }}
          label="Horizon"
          variant="boxed"
        />
        {partNote(questions, 'the questions')}
        {questions.status === 'ready' && list.length === 0 && (
          <p className={styles.muted}>No open questions resolve within this horizon.</p>
        )}
        <ul className={styles.rows} aria-label="Forecast questions">
          {shown.map((question) => (
            <QuestionRow
              key={question.id}
              api={api}
              question={question}
              onOpen={() => setOpen(question)}
            />
          ))}
        </ul>
        {!all && list.length > QUESTION_ROWS && (
          <button type="button" className={styles.linkButton} onClick={() => setAll(true)}>
            Show all {list.length} questions
          </button>
        )}
        <div className={styles.legendRow}>
          <button type="button" className={styles.linkButton} onClick={onLedger}>
            View forecast ledger →
          </button>
          <span className={styles.muted}>Probability trend:</span>
          {(['High', 'Medium', 'Low'] as const).map((level) => (
            <span key={level} className={styles.legendKey} data-tone={levelTone(level)}>
              {level}
            </span>
          ))}
        </div>
      </section>
      {open && api && (
        <QuestionDetail api={api} summary={open} onClose={() => setOpen(undefined)} />
      )}
    </div>
  );
}

/** One question's row: its title and date, the pill with the trend arrow, and the sparkline. */
function QuestionRow({
  api,
  question,
  onOpen,
}: {
  api: ForesignalClient | undefined;
  question: QuestionSummary;
  onOpen: () => void;
}) {
  const history = useRead(api, question.id, readHistory);
  const values = useMemo(
    () => (history.status === 'ready' ? trendValues(trendSeries(history.value)) : []),
    [history],
  );
  const p = question.ensembleProbability ?? values.at(-1);
  const arrow = trendArrow(values);
  return (
    <li className={styles.questionRow} data-testid="forecast-row">
      <span className={styles.hypothesisText}>
        <button type="button" className={styles.linkButton} onClick={onOpen}>
          {question.title}
        </button>
        <span className={styles.listMeta}>
          <span>By {question.resolveBy.slice(0, 10)}</span>
          <Badge tone="neutral">{question.category}</Badge>
          {question.estimativeTerm && <span>{question.estimativeTerm}</span>}
        </span>
      </span>
      <span data-testid="forecast-probability">
        <Badge kind="count" tone={pillTone(p)}>
          {probabilityText(p)}
          {arrow && ` ${arrow}`}
        </Badge>
      </span>
      <Sparkline
        values={values}
        width={120}
        height={22}
        tone={p === null || p === undefined ? 'accent' : levelTone(trendLevel(p))}
        label={`${question.title}: probability by day`}
      />
    </li>
  );
}

/**
 * A question in full, beside the list: its resolution criteria and date, the ensemble and its
 * term, every forecaster's line by day (an ECharts chart), and each forecaster's latest forecast
 * with its rationale.
 */
function QuestionDetail({
  api,
  summary,
  onClose,
}: {
  api: ForesignalClient;
  summary: QuestionSummary;
  onClose: () => void;
}) {
  const theme = useTheme();
  const question = useRead(api, summary.id, readQuestion);
  const history = useRead(api, summary.id, readHistory);
  const forecasts = useRead(api, summary.id, readForecasts);
  const lines = useMemo(
    () => (history.status === 'ready' ? historyLines(history.value) : []),
    [history],
  );
  const option = useMemo(
    () => timeSeriesOption(theme.tokens, lines, undefined, true),
    [theme.tokens, lines],
  );
  const full = question.status === 'ready' ? question.value : undefined;
  return (
    <aside className={styles.drawer} aria-label="Question" data-testid="question-detail">
      <div className={styles.drawerHead}>
        <h2 className={styles.cardTitle}>{summary.title}</h2>
        <IconButton label="Close question" icon={<X size={15} />} onClick={onClose} />
      </div>
      <dl className={styles.facts}>
        <dt>Ensemble</dt>
        <dd>
          {probabilityText(summary.ensembleProbability)}
          {summary.estimativeTerm ? ` (${summary.estimativeTerm})` : ''}
        </dd>
        <dt>Resolves by</dt>
        <dd>{utcText(summary.resolveBy)}</dd>
        <dt>Type</dt>
        <dd>
          {prettifyId(summary.type)} · {prettifyId(summary.resolverType)}
        </dd>
        <dt>Forecasts</dt>
        <dd>{summary.forecastCount ?? '—'}</dd>
      </dl>
      {full && <p className={styles.text}>{full.resolutionCriteria}</p>}
      {partNote(question, 'the question')}
      {partNote(history, 'the history')}
      {lines.length > 0 && (
        <EChart
          option={option}
          height={180}
          label={`${summary.title}: each forecaster's probability by day`}
          testId="question-history"
        />
      )}
      {history.status === 'ready' && lines.length === 0 && (
        <p className={styles.muted}>No forecaster has a probability history yet.</p>
      )}
      <h3 className={styles.cardTitle}>Forecasters</h3>
      {partNote(forecasts, 'the forecasts')}
      {forecasts.status === 'ready' && forecasts.value.length === 0 && (
        <p className={styles.muted}>No forecasts yet.</p>
      )}
      <ul className={styles.rows} aria-label="Latest forecasts">
        {(forecasts.status === 'ready' ? latestByForecaster(forecasts.value) : []).map((f) => (
          <li key={f.id} className={styles.findingRow}>
            <span className={styles.titleRow}>
              <strong>{prettifyId(f.forecasterId)}</strong>
              <Badge tone="neutral">{f.forecasterType}</Badge>
              <span className={styles.pill}>{forecastText(f, full)}</span>
            </span>
            <span className={styles.listMeta}>
              {utcText(f.madeAt)}
              {f.recalibrated ? ' · recalibrated' : ''}
            </span>
            {f.rationale && <span className={styles.clamp}>{f.rationale}</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * The forecast ledger: the scorecard (`getForecastScorecard`), a row per forecaster and category
 * with its resolved count, Brier and log scores, skill against its reference and ensemble weight;
 * and the calibration curve (`getForecastCalibration`), a reliability diagram with its bins and the
 * recalibrated curve.
 */
export function LedgerView({ api, onBack }: { api: ForesignalClient; onBack: () => void }) {
  const theme = useTheme();
  const scorecard = useRead(api, 'all', readScorecard);
  const calibration = useRead(api, 'all', readCalibration);
  // The 2.0.0 response is a union: the probability reliability diagram, or the numeric (quantile)
  // variant. Discriminate once; the probability member feeds the reliability chart.
  const probability =
    calibration.status === 'ready' && !isNumericCalibration(calibration.value)
      ? calibration.value
      : undefined;
  const numeric =
    calibration.status === 'ready' && isNumericCalibration(calibration.value)
      ? calibration.value
      : undefined;
  const option = useMemo(
    () =>
      probability
        ? reliabilityOption(
            theme.tokens,
            reliabilityBins(probability),
            calibrationCurve(probability),
          )
        : undefined,
    [probability, theme.tokens],
  );
  return (
    <div className={styles.grid} data-testid="forecast-ledger">
      <section className={styles.card} aria-labelledby="scorecard-title" data-testid="scorecard">
        <div className={styles.drawerHead}>
          <h2 id="scorecard-title" className={styles.cardTitle}>
            Forecast Ledger: Scorecard
          </h2>
          <Button icon={<ArrowLeft size={14} />} onClick={onBack}>
            Forecasts
          </Button>
        </div>
        {partNote(scorecard, 'the scorecard')}
        {scorecard.status === 'ready' && (
          <>
            <p className={styles.muted}>
              Scorer {scorecard.value.scorerVersion} · computed{' '}
              {utcText(scorecard.value.computedAt)}
              {scorecard.value.retrospective ? ' · retrospective evaluation' : ''}
            </p>
            {scorecard.value.entries.length === 0 ? (
              <p className={styles.muted}>No questions have resolved and been scored yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table} aria-label="Scorecard">
                  <thead>
                    <tr>
                      <th>Forecaster</th>
                      <th>Category</th>
                      <th>Resolved</th>
                      <th>Brier</th>
                      <th>Log score</th>
                      <th>Skill</th>
                      <th>Ensemble weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorecardRows(scorecard.value.entries).map((entry) => (
                      <tr
                        key={`${entry.forecasterId}-${entry.category ?? 'all'}`}
                        data-label={entry.label}
                      >
                        <td>
                          {prettifyId(entry.forecasterId)}
                          {entry.forecasterType && (
                            <span className={styles.muted}> ({entry.forecasterType})</span>
                          )}
                        </td>
                        <td>{entry.category ?? 'All'}</td>
                        <td>
                          {entry.nResolved}
                          {entry.label === 'insufficient' && (
                            <>
                              {' '}
                              <Badge tone="warning" uppercase={false}>
                                insufficient
                              </Badge>
                            </>
                          )}
                        </td>
                        <td>{scoreText(entry.brier)}</td>
                        <td>{scoreText(entry.logScore)}</td>
                        <td>
                          {entry.skill
                            ? `${scoreText(entry.skill.value)} vs. ${entry.skill.reference}`
                            : '—'}
                        </td>
                        <td>{scoreText(entry.ensembleWeight)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      <section
        className={styles.card}
        aria-labelledby="calibration-title"
        data-testid="calibration"
      >
        <h2 id="calibration-title" className={styles.cardTitle}>
          Calibration
        </h2>
        {partNote(calibration, 'the calibration')}
        {probability && option && (
          <>
            <EChart
              option={option}
              height={260}
              label="Calibration: forecast probability against observed frequency"
              testId="calibration-chart"
            />
            <p className={styles.muted}>
              n = {probability.n} · {probability.method === 'corp' ? 'CORP' : 'bins'}
              {probability.sharpness !== null && probability.sharpness !== undefined
                ? ` · sharpness ${scoreText(probability.sharpness)}`
                : ''}
              {probability.decomposition
                ? ` · miscalibration ${scoreText(probability.decomposition.miscalibration)}, discrimination ${scoreText(probability.decomposition.discrimination)}`
                : ''}
            </p>
            {probability.label === 'insufficient' && (
              <p className={styles.muted} data-testid="calibration-insufficient">
                Too few resolved forecasts to judge calibration yet.
              </p>
            )}
          </>
        )}
        {numeric && <NumericCalibration calibration={numeric} />}
      </section>
      <IntelCalibrationPanel api={api} />
    </div>
  );
}

/**
 * The numeric calibration summary (`ForecastNumericCalibration`): each stated quantile's empirical
 * coverage against its nominal level, with the PIT sample size. Read-only context (R2-010).
 */
function NumericCalibration({ calibration }: { calibration: ForecastNumericCalibration }) {
  return (
    <div data-testid="calibration-numeric">
      <p className={styles.muted}>
        Numeric calibration · n = {calibration.n}
        {calibration.pit ? ` · PIT n = ${calibration.pit.n}` : ''}
      </p>
      {calibration.quantileReliability.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Quantile reliability">
            <thead>
              <tr>
                <th>Quantile</th>
                <th>Nominal</th>
                <th>Empirical</th>
                <th>n</th>
              </tr>
            </thead>
            <tbody>
              {calibration.quantileReliability.map((q) => (
                <tr key={q.quantile ?? q.level}>
                  <td>{q.quantile ?? scoreText(q.level)}</td>
                  <td>{scoreText(q.nominal)}</td>
                  <td>{scoreText(q.empirical)}</td>
                  <td>{q.n ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {calibration.label === 'insufficient' && (
        <p className={styles.muted} data-testid="calibration-insufficient">
          Too few resolved numeric questions to judge calibration yet.
        </p>
      )}
    </div>
  );
}
