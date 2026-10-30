import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe } from '../api/useMe';
import { AccessNotice } from '../auth/AccessNotice';
import { useCan } from '../auth/permissions';
import { useRead } from '../intel/useHypotheses';
import { useToast } from '../ui/toast-context';
import { Button } from '../ui/Button';
import type { Session } from '../app/session';
import {
  createMyEdition,
  listMyEditions,
  updateMyEdition,
  type BriefingInput,
  type EditionSummary,
} from './editionsApi';
import styles from '../account/AccountView.module.css';
import editions from './Editions.module.css';

/** A delivery target the user is building: the kind and format are required, the channel optional. */
type TargetDraft = {
  kind: 'channel' | 'website' | 'podcast';
  format: 'email' | 'push' | 'alert' | 'html' | 'audio';
  channelId: string;
};

/** The editable form of a {@link BriefingInput}: strings in the inputs, parsed on submit. */
interface EditionForm {
  name: string;
  enabled: boolean;
  schedule: string;
  timezone: string;
  mode: '' | 'digest' | 'llm';
  outputLanguage: string;
  instructions: string;
  /** Source ids, one per line. */
  sources: string;
  /** Record kinds ("sections"), one per line. */
  kinds: string;
  /** Items per section; empty for the backend default. */
  maxItemsPerKind: string;
  /** Each item carries its cross-linked evidence (the reader's provenance badges, NP-002). */
  includeProvenance: boolean;
  /** Each item carries its corroboration signal (the reader's corroboration badges, NP-002). */
  includeCorroboration: boolean;
  targets: TargetDraft[];
}

/** An empty form for a new edition: enabled, no scope, no targets. */
const EMPTY_FORM: EditionForm = {
  name: '',
  enabled: true,
  schedule: '0 7 * * *',
  timezone: 'UTC',
  mode: '',
  outputLanguage: '',
  instructions: '',
  sources: '',
  kinds: '',
  maxItemsPerKind: '',
  includeProvenance: false,
  includeCorroboration: false,
  targets: [],
};

/** Splits a textarea into trimmed, non-empty lines. */
function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Builds the {@link BriefingInput} to send from the form. Only `name` and `schedule` are required;
 * every other field is omitted when empty so the backend keeps its default. `ownerUserId` is never
 * sent — the backend forces it to the caller (NP-003).
 */
function toInput(form: EditionForm): BriefingInput {
  const max = Number.parseInt(form.maxItemsPerKind, 10);
  // openapi-typescript marks every field with a `default` as required, so each is set here to the
  // form value or its documented backend default rather than omitted.
  const input: BriefingInput = {
    name: form.name.trim(),
    schedule: form.schedule.trim(),
    enabled: form.enabled,
    timezone: form.timezone.trim() || 'UTC',
    mode: form.mode || 'digest',
    maxItemsPerKind: form.maxItemsPerKind.trim() && Number.isFinite(max) ? max : 5,
    includeProvenance: form.includeProvenance,
    includeCorroboration: form.includeCorroboration,
  };
  // outputLanguage is `string | null`: null means "the owner's preference" (NP-003).
  if (form.outputLanguage.trim()) input.outputLanguage = form.outputLanguage.trim();
  if (form.instructions.trim()) input.instructions = form.instructions.trim();
  const sources = lines(form.sources);
  const kinds = lines(form.kinds);
  if (sources.length > 0 || kinds.length > 0) {
    input.scope = {
      ...(sources.length > 0 ? { sources } : {}),
      ...(kinds.length > 0 ? { kinds } : {}),
      // Same default-required rule applies to BriefingScope's defaulted flags.
      includeHealth: true,
      includeAlertQuality: false,
    };
  }
  if (form.targets.length > 0) {
    input.deliveryTargets = form.targets.map((target) => ({
      kind: target.kind,
      format: target.format,
      ...(target.channelId.trim() ? { channelId: target.channelId.trim() } : {}),
    }));
  }
  return input;
}

/** Prefills the form from the list summary of an existing edition (the only self-service read). */
function formFromSummary(summary: EditionSummary): EditionForm {
  return {
    ...EMPTY_FORM,
    name: summary.name,
    enabled: summary.enabled,
    schedule: summary.schedule,
    timezone: summary.timezone,
    outputLanguage: summary.outputLanguage ?? '',
  };
}

/**
 * The self-service edition editor (NP-003): a signed-in user holding `self.editions` creates a new
 * edition (`createMyEdition`) or replaces one they own (`updateMyEdition`). Presentation only — the
 * composition, scheduling, translation and delivery run in the backend.
 *
 * A user without `self.editions` is sent back to the read-only reader; an anonymous visitor gets a
 * sign-in affordance. The backend forces `ownerUserId` to the caller, so no other user's id is sent.
 */
export function EditionEditor({ session, mode }: { session: Session; mode: 'create' | 'edit' }) {
  const { briefingId } = useParams();
  const me = useMe();
  const can = useCan();

  if (!me) {
    return (
      <Shell title="New edition">
        <p className={styles.muted}>
          <Link to="/signin">Sign in</Link> to build your own edition.
        </p>
      </Shell>
    );
  }
  if (!can('self.editions')) {
    return (
      <Shell title="New edition">
        <p className={styles.muted}>
          Your role does not include building editions. You can still{' '}
          <Link to="/editions">read the editions you own</Link>.
        </p>
      </Shell>
    );
  }
  if (mode === 'edit' && briefingId) {
    return <EditExistingEdition session={session} briefingId={briefingId} />;
  }
  return <EditorForm session={session} mode="create" initial={EMPTY_FORM} />;
}

/** Loads the edition's list summary to prefill the edit form, then renders the editor. */
function EditExistingEdition({ session, briefingId }: { session: Session; briefingId: string }) {
  const result = useRead(session.api, `edit:${briefingId}`, (client, _key, signal) =>
    listMyEditions(client, {}, signal),
  );
  if (result.status === 'loading') {
    return (
      <Shell title="Edit edition">
        <p className={styles.muted}>Loading your edition…</p>
      </Shell>
    );
  }
  if (result.status === 'error') {
    return (
      <Shell title="Edit edition">
        <AccessNotice error={new Error(result.message)} />
      </Shell>
    );
  }
  const summary = result.value.items.find((item) => item.briefingId === briefingId);
  if (!summary) {
    return (
      <Shell title="Edit edition">
        <p className={styles.muted}>
          That edition is not in your list. <Link to="/editions">Back to editions</Link>.
        </p>
      </Shell>
    );
  }
  return (
    <EditorForm
      session={session}
      mode="edit"
      briefingId={briefingId}
      initial={formFromSummary(summary)}
    />
  );
}

/** The page chrome shared by every state of the editor. */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.head}>
          <h1 className={styles.title}>{title}</h1>
          <Link to="/editions">Back to editions</Link>
        </div>
        {children}
      </section>
    </div>
  );
}

/** The form itself, with its own draft and save state. */
function EditorForm({
  session,
  mode,
  briefingId,
  initial,
}: {
  session: Session;
  mode: 'create' | 'edit';
  briefingId?: string;
  initial: EditionForm;
}) {
  const [form, setForm] = useState<EditionForm>(initial);
  const [status, setStatus] = useState<
    { kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; error: unknown }
  >({ kind: 'idle' });
  const navigate = useNavigate();
  const toast = useToast();

  const patch = (next: Partial<EditionForm>) => {
    setForm((current) => ({ ...current, ...next }));
    setStatus({ kind: 'idle' });
  };
  const canSubmit = form.name.trim().length > 0 && form.schedule.trim().length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus({ kind: 'saving' });
    try {
      const body = toInput(form);
      const saved =
        mode === 'edit' && briefingId
          ? await updateMyEdition(session.api, briefingId, body)
          : await createMyEdition(session.api, body);
      toast.show({
        title: mode === 'edit' ? 'Edition updated.' : 'Edition created.',
        tone: 'success',
      });
      const id = saved.id ?? briefingId;
      navigate(id ? `/editions/${id}` : '/editions');
    } catch (error) {
      setStatus({ kind: 'error', error });
    }
  };

  const title = mode === 'edit' ? 'Edit edition' : 'New edition';
  return (
    <Shell title={title}>
      <form className={editions.form} onSubmit={submit} aria-label={title}>
        {mode === 'edit' && (
          <p className={styles.muted}>
            Saving replaces this edition&rsquo;s configuration. Fields left blank here revert to the
            backend defaults; the self-service surface does not read back scope, sections or
            targets, so re-enter any you want to keep.
          </p>
        )}

        <label className={styles.field}>
          <span>Name</span>
          <input
            type="text"
            required
            value={form.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          Enabled (run on its schedule)
        </label>

        <label className={styles.field}>
          <span>Schedule (5-field cron)</span>
          <input
            type="text"
            required
            placeholder="0 7 * * *"
            value={form.schedule}
            onChange={(event) => patch({ schedule: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Timezone</span>
          <input
            type="text"
            placeholder="UTC"
            value={form.timezone}
            onChange={(event) => patch({ timezone: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Mode</span>
          <select
            value={form.mode}
            onChange={(event) => patch({ mode: event.target.value as EditionForm['mode'] })}
          >
            <option value="">Backend default (digest)</option>
            <option value="digest">Digest</option>
            <option value="llm">LLM</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Output language (BCP 47)</span>
          <input
            type="text"
            placeholder="e.g. en, es, pt-BR — blank for your preference"
            value={form.outputLanguage}
            onChange={(event) => patch({ outputLanguage: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Instructions (optional)</span>
          <textarea
            rows={3}
            value={form.instructions}
            onChange={(event) => patch({ instructions: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Feed / sources (one source id per line)</span>
          <textarea
            rows={3}
            value={form.sources}
            onChange={(event) => patch({ sources: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Sections / record kinds (one per line)</span>
          <textarea
            rows={3}
            value={form.kinds}
            onChange={(event) => patch({ kinds: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Items per section</span>
          <input
            type="number"
            min={1}
            max={50}
            placeholder="5"
            value={form.maxItemsPerKind}
            onChange={(event) => patch({ maxItemsPerKind: event.target.value })}
          />
        </label>

        <fieldset className={styles.field}>
          <legend>Evidence badges</legend>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={form.includeProvenance}
              onChange={(event) => patch({ includeProvenance: event.target.checked })}
            />
            Show why each item is in the edition (provenance)
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={form.includeCorroboration}
              onChange={(event) => patch({ includeCorroboration: event.target.checked })}
            />
            Show each item&rsquo;s corroboration signal
          </label>
        </fieldset>

        <DeliveryTargets targets={form.targets} onChange={(targets) => patch({ targets })} />

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={!canSubmit || status.kind === 'saving'}>
            {status.kind === 'saving'
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save edition'
                : 'Create edition'}
          </Button>
          <Link to="/editions">Cancel</Link>
        </div>
        {status.kind === 'error' && <AccessNotice error={status.error} />}
      </form>
    </Shell>
  );
}

const TARGET_KINDS: TargetDraft['kind'][] = ['channel', 'website', 'podcast'];
const TARGET_FORMATS: TargetDraft['format'][] = ['email', 'push', 'alert', 'html', 'audio'];

/** The repeatable output-targets editor: where each run of the edition is delivered. */
function DeliveryTargets({
  targets,
  onChange,
}: {
  targets: TargetDraft[];
  onChange: (targets: TargetDraft[]) => void;
}) {
  const add = () => onChange([...targets, { kind: 'website', format: 'html', channelId: '' }]);
  const remove = (index: number) => onChange(targets.filter((_, i) => i !== index));
  const patch = (index: number, next: Partial<TargetDraft>) =>
    onChange(targets.map((target, i) => (i === index ? { ...target, ...next } : target)));

  return (
    <fieldset className={styles.field}>
      <legend>Output targets</legend>
      {targets.length === 0 && (
        <p className={styles.muted}>No targets added — the backend delivers to every channel.</p>
      )}
      <ul className={editions.targets}>
        {targets.map((target, index) => (
          <li key={index} className={editions.target}>
            <select
              aria-label={`Target ${index + 1} kind`}
              value={target.kind}
              onChange={(event) =>
                patch(index, { kind: event.target.value as TargetDraft['kind'] })
              }
            >
              {TARGET_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <select
              aria-label={`Target ${index + 1} format`}
              value={target.format}
              onChange={(event) =>
                patch(index, { format: event.target.value as TargetDraft['format'] })
              }
            >
              {TARGET_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label={`Target ${index + 1} channel id`}
              placeholder="channel id (optional)"
              value={target.channelId}
              onChange={(event) => patch(index, { channelId: event.target.value })}
            />
            <Button type="button" onClick={() => remove(index)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button type="button" onClick={add}>
          Add target
        </Button>
      </div>
    </fieldset>
  );
}
