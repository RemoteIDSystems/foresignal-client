import { useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ForesignalClient } from '../api/client';
import type { Part } from '../intel/useEvidence';
import type { CommittedViewport } from '../state/viewport';
import { Button, IconButton } from '../ui/Button';
import analysis from '../views/analysis/Analysis.module.css';
import { DryRunResult } from './DryRunResult';
import {
  CONDITION_OPS,
  draftProblems,
  isWindowed,
  RULE_TYPES,
  scopeLabel,
  SEVERITIES,
  toRuleInput,
  viewportScope,
  WEEKDAYS,
  type ConditionDraft,
  type RuleDraft,
  type RuleScope,
} from './ruleDraft';
import {
  createTrigger,
  dryRunRule,
  updateTrigger,
  type KindSummary,
  type TriggerRule,
  type TriggerTestResult,
  type Watchlist,
} from './triggerApi';
import styles from './Rules.module.css';

/** How far back a dry run can look. */
const LOOKBACKS = [
  { key: '24h', label: 'Last 24 hours', ms: 24 * 3_600_000 },
  { key: '7d', label: 'Last 7 days', ms: 7 * 24 * 3_600_000 },
] as const;

/** Props for {@link RuleForm}. */
export interface RuleFormProps {
  api: ForesignalClient | undefined;
  /** The form's starting state: a new rule (scope prefilled) or a stored rule's. */
  initial: RuleDraft;
  /** The stored rule when editing; fields the form does not show are kept from it. */
  base?: TriggerRule;
  /** The last committed map view, offered as a scope. */
  viewport: CommittedViewport | undefined;
  /** The caller's watchlists, offered as scopes. */
  watchlists: Part<Watchlist[]>;
  /** The kinds and their sources, suggested in the kind and source fields. */
  kinds: Part<KindSummary[]>;
  /** Whether the token may write rules (`agent` scope). */
  canWrite: boolean;
  /** Called with the stored rule after a save. */
  onSaved: (rule: TriggerRule) => void;
  /** Called when the form is closed without saving. */
  onCancel: () => void;
}

type DryRunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; result: TriggerTestResult; since: string }
  | { status: 'error'; message: string };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A labeled field. */
function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={[styles.field, wide && styles.wide].filter(Boolean).join(' ')}>
      {label}
      {children}
    </label>
  );
}

/**
 * The rule-authoring form (030): what to watch (kinds, sources, ANDed threshold conditions), where
 * (everywhere, the current map view, a situation's regions as a region preset, or a watchlist),
 * the rule type (`record`, or a windowed `count`, `absence` or `anomaly`), severity, cooldown,
 * active window and enrichment. **Dry run** backtests the rule over stored data (`testTrigger`)
 * and shows the result inline; **Save** creates or replaces it. The client only writes the rule:
 * the backend evaluates it.
 */
export function RuleForm({
  api,
  initial,
  base,
  viewport,
  watchlists,
  kinds,
  canWrite,
  onSaved,
  onCancel,
}: RuleFormProps) {
  const [draft, setDraft] = useState(initial);
  const [lookback, setLookback] = useState<(typeof LOOKBACKS)[number]['key']>('24h');
  const [dryRun, setDryRun] = useState<DryRunState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const problems = draftProblems(draft);
  const update = (patch: Partial<RuleDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDryRun((current) => (current.status === 'running' ? current : { status: 'idle' }));
  };
  const setCondition = (index: number, patch: Partial<ConditionDraft>) =>
    update({
      conditions: draft.conditions.map((condition, at) =>
        at === index ? { ...condition, ...patch } : condition,
      ),
    });
  const windowed = isWindowed(draft.type);
  const watchlistItems = watchlists.status === 'ready' ? watchlists.value : [];
  const kindItems = kinds.status === 'ready' ? kinds.value : [];
  const sourceNames = [...new Set(kindItems.flatMap((kind) => kind.sources ?? []))].sort();

  const setScope = (kind: RuleScope['kind'] | 'kept') => {
    if (kind === 'everywhere') update({ scope: { kind } });
    else if (kind === 'viewport') update({ scope: viewportScope(viewport) });
    else if (kind === 'region')
      update({
        scope: { kind: 'region', codes: [], label: 'Regions' },
      });
    else if (kind === 'watchlist') {
      const first = watchlistItems[0];
      if (first) update({ scope: { kind: 'watchlist', id: first.id, label: first.name } });
    } else update({ scope: initial.scope });
  };

  const runDryRun = async () => {
    if (!api || problems.length) return;
    const since = new Date(
      Date.now() - LOOKBACKS.find((option) => option.key === lookback)!.ms,
    ).toISOString();
    setDryRun({ status: 'running' });
    try {
      const result = await dryRunRule(api, toRuleInput(draft, base), { since });
      setDryRun({ status: 'ready', result, since });
    } catch (error) {
      setDryRun({ status: 'error', message: messageOf(error) });
    }
  };

  const save = async () => {
    if (!api || problems.length) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const input = toRuleInput(draft, base);
      onSaved(base ? await updateTrigger(api, base.id, input) : await createTrigger(api, input));
    } catch (error) {
      setSaveError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className={styles.form}
      aria-label={base ? `Edit rule ${base.name}` : 'New alert rule'}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className={styles.fields}>
        <Field label="Name" wide>
          <input
            className={analysis.input}
            value={draft.name}
            maxLength={200}
            onChange={(event) => update({ name: event.target.value })}
            placeholder="Russia–NATO border activity"
          />
        </Field>
        <Field label="Severity">
          <select
            className={analysis.select}
            value={draft.severity}
            onChange={(event) => update({ severity: event.target.value as RuleDraft['severity'] })}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select
            className={analysis.select}
            value={draft.type}
            onChange={(event) => update({ type: event.target.value as RuleDraft['type'] })}
          >
            {RULE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kinds (comma-separated)">
          <input
            className={analysis.input}
            value={draft.kinds}
            list="rule-kinds"
            onChange={(event) => update({ kinds: event.target.value })}
            placeholder="Any kind"
          />
        </Field>
        <Field label="Sources (comma-separated)">
          <input
            className={analysis.input}
            value={draft.sources}
            list="rule-sources"
            onChange={(event) => update({ sources: event.target.value })}
            placeholder="Any source"
          />
        </Field>
        <datalist id="rule-kinds">
          {kindItems.map((kind) => (
            <option key={kind.kind} value={kind.kind} />
          ))}
        </datalist>
        <datalist id="rule-sources">
          {sourceNames.map((source) => (
            <option key={source} value={source} />
          ))}
        </datalist>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Scope</legend>
        <div className={styles.fields}>
          <Field label="Watch">
            <select
              className={analysis.select}
              value={draft.scope.kind}
              onChange={(event) => setScope(event.target.value as RuleScope['kind'])}
            >
              <option value="everywhere">Everywhere</option>
              <option value="viewport" disabled={!viewport}>
                Current map view
              </option>
              <option value="region">Regions (country or admin-1 codes)</option>
              <option value="watchlist" disabled={!watchlistItems.length}>
                Watchlist
              </option>
              {initial.scope.kind === 'kept' && <option value="kept">As stored</option>}
            </select>
          </Field>
          {draft.scope.kind === 'region' && (
            <Field label="Region codes (e.g. RU, PL, US-TX)">
              <input
                className={analysis.input}
                value={draft.scope.codes.join(', ')}
                onChange={(event) =>
                  update({
                    scope: {
                      kind: 'region',
                      label: draft.scope.kind === 'region' ? draft.scope.label : 'Regions',
                      codes: event.target.value
                        .split(',')
                        .map((code) => code.trim().toUpperCase())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </Field>
          )}
          {draft.scope.kind === 'watchlist' && (
            <Field label="Watchlist">
              <select
                className={analysis.select}
                value={draft.scope.id}
                onChange={(event) => {
                  const list = watchlistItems.find((item) => item.id === event.target.value);
                  if (list) update({ scope: { kind: 'watchlist', id: list.id, label: list.name } });
                }}
              >
                {watchlistItems.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <p className={analysis.muted}>{scopeLabel(draft.scope)}</p>
        {watchlists.status === 'error' && (
          <p className={analysis.muted}>Watchlists: {watchlists.message}</p>
        )}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Conditions (all must hold)</legend>
        {draft.conditions.map((condition, index) => (
          <div key={index} className={styles.condition}>
            <input
              className={analysis.input}
              aria-label={`Condition ${index + 1} field`}
              value={condition.path}
              placeholder="mag"
              onChange={(event) => setCondition(index, { path: event.target.value })}
            />
            <select
              className={analysis.select}
              aria-label={`Condition ${index + 1} operator`}
              value={condition.op}
              onChange={(event) =>
                setCondition(index, { op: event.target.value as ConditionDraft['op'] })
              }
            >
              {CONDITION_OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              className={analysis.input}
              aria-label={`Condition ${index + 1} value`}
              value={condition.value}
              placeholder={condition.op === 'in' || condition.op === 'notIn' ? 'a, b, c' : '5'}
              onChange={(event) => setCondition(index, { value: event.target.value })}
            />
            <IconButton
              label={`Remove condition ${index + 1}`}
              icon={<Trash2 size={14} />}
              onClick={() =>
                update({ conditions: draft.conditions.filter((_, at) => at !== index) })
              }
            />
          </div>
        ))}
        <div className={styles.buttons}>
          <Button
            type="button"
            variant="ghost"
            icon={<Plus size={14} />}
            onClick={() =>
              update({ conditions: [...draft.conditions, { path: '', op: '>=', value: '' }] })
            }
          >
            Add condition
          </Button>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>{windowed ? 'Window' : 'Firing'}</legend>
        <div className={styles.fields}>
          {!windowed && (
            <Field label="Mode">
              <select
                className={analysis.select}
                value={draft.mode}
                onChange={(event) => update({ mode: event.target.value as RuleDraft['mode'] })}
              >
                <option value="match">match</option>
                <option value="enter">enter</option>
                <option value="exit">exit</option>
              </select>
            </Field>
          )}
          {windowed && (
            <Field label="Window (e.g. 30m, 6h, 7d)">
              <input
                className={analysis.input}
                value={draft.window}
                onChange={(event) => update({ window: event.target.value })}
              />
            </Field>
          )}
          {draft.type === 'count' && (
            <>
              <Field label="Count">
                <select
                  className={analysis.select}
                  value={draft.countOp}
                  onChange={(event) =>
                    update({ countOp: event.target.value as RuleDraft['countOp'] })
                  }
                >
                  <option value=">=">&gt;=</option>
                  <option value="<=">&lt;=</option>
                </select>
              </Field>
              <Field label="Threshold">
                <input
                  className={analysis.input}
                  inputMode="numeric"
                  value={draft.threshold}
                  onChange={(event) => update({ threshold: event.target.value })}
                />
              </Field>
            </>
          )}
          {draft.type === 'anomaly' && (
            <>
              <Field label="Direction">
                <select
                  className={analysis.select}
                  value={draft.direction}
                  onChange={(event) =>
                    update({ direction: event.target.value as RuleDraft['direction'] })
                  }
                >
                  <option value="up">up</option>
                  <option value="down">down</option>
                  <option value="both">both</option>
                </select>
              </Field>
              <Field label="Sensitivity">
                <select
                  className={analysis.select}
                  value={draft.sensitivity}
                  onChange={(event) =>
                    update({ sensitivity: event.target.value as RuleDraft['sensitivity'] })
                  }
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </Field>
            </>
          )}
          {windowed && (
            <Field label="Group by (optional)">
              <input
                className={analysis.input}
                value={draft.groupBy}
                placeholder="country, admin1, source, …"
                onChange={(event) => update({ groupBy: event.target.value })}
              />
            </Field>
          )}
          <Field label="Cooldown (e.g. 15m, 1h)">
            <input
              className={analysis.input}
              value={draft.cooldown}
              onChange={(event) => update({ cooldown: event.target.value })}
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <input
              className={analysis.input}
              value={draft.tags}
              onChange={(event) => update({ tags: event.target.value })}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Active window</legend>
        <div className={styles.days} role="group" aria-label="Active days">
          {WEEKDAYS.map((day) => {
            const on = draft.activeDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                className={styles.day}
                aria-pressed={on}
                onClick={() =>
                  update({
                    activeDays: on
                      ? draft.activeDays.filter((other) => other !== day)
                      : WEEKDAYS.filter(
                          (other) => other === day || draft.activeDays.includes(other),
                        ),
                  })
                }
              >
                {day}
              </button>
            );
          })}
        </div>
        {draft.activeDays.length > 0 ? (
          <div className={styles.fields}>
            <Field label="From">
              <input
                className={analysis.input}
                type="time"
                value={draft.activeStart}
                onChange={(event) => update({ activeStart: event.target.value })}
              />
            </Field>
            <Field label="Until">
              <input
                className={analysis.input}
                type="time"
                value={draft.activeEnd}
                onChange={(event) => update({ activeEnd: event.target.value })}
              />
            </Field>
            <Field label="Time zone">
              <input
                className={analysis.input}
                value={draft.timezone}
                onChange={(event) => update({ timezone: event.target.value })}
              />
            </Field>
          </div>
        ) : (
          <p className={analysis.muted}>Always active. Pick days to limit it.</p>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={draft.enrich}
            onChange={(event) => update({ enrich: event.target.checked })}
          />
          Enrich each alert with a context summary
        </label>
      </fieldset>

      {problems.length > 0 && (
        <ul className={styles.problems} aria-label="Before this rule can be sent">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {!canWrite && (
        <p className={analysis.muted}>
          Writing and dry-running rules needs a token with the agent scope (Settings).
        </p>
      )}

      <div className={styles.buttons}>
        <select
          className={analysis.select}
          aria-label="Dry run period"
          value={lookback}
          onChange={(event) => setLookback(event.target.value as typeof lookback)}
        >
          {LOOKBACKS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          disabled={!canWrite || problems.length > 0 || dryRun.status === 'running'}
          onClick={() => void runDryRun()}
        >
          {dryRun.status === 'running' ? 'Running…' : 'Dry run'}
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!canWrite || problems.length > 0 || saving}
        >
          {saving ? 'Saving…' : base ? 'Save changes' : 'Save rule'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {saveError && (
        <p className={analysis.error} role="alert">
          Not saved: {saveError}
        </p>
      )}
      {dryRun.status === 'error' && (
        <p className={analysis.error} role="alert">
          Dry run failed: {dryRun.message}
        </p>
      )}
      {dryRun.status === 'ready' && <DryRunResult result={dryRun.result} since={dryRun.since} />}
    </form>
  );
}
