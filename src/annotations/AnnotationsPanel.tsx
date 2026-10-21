import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { ForesignalClient } from '../api/client';
import { utcText } from '../intel/analysisView';
import type { ObjectAction } from '../objects/objectApi';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import {
  createNote,
  createVerdict,
  deleteAnnotation,
  getAuthor,
  getCaller,
  listAnnotations,
  updateAnnotation,
  VERDICTS,
  type Annotation,
  type Me,
  type Verdict,
} from './annotationApi';
import {
  canChange,
  initials,
  NOTE_SCOPES,
  notePermissions,
  scopeNotes,
  type NoteScope,
} from './annotationView';
import styles from './Annotations.module.css';

/** Props for {@link AnnotationsPanel}. */
export interface AnnotationsPanelProps {
  api: ForesignalClient | undefined;
  /** The object the notes are on. */
  objectRef: string;
  /** The object's envelope actions: what the calling token may do on it. */
  actions: readonly ObjectAction[] | undefined;
  /** The panel's heading; the mock's "Analysis Notes" by default. */
  heading?: string;
}

/** What a failed read or write says. */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'It did not load.');

/** The annotations as read, or why they could not be. */
type Notes = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

/** One object's notes as read, kept by its ref. */
interface Read {
  ref: string;
  notes: Annotation[];
  state: Notes;
}

/** No notes, shared so an empty list keeps its identity between renders. */
const NO_NOTES: Annotation[] = [];

/**
 * The Analysis Notes panel (026), as the mock draws it: All Notes / My Notes / Shared with counts,
 * `+ Add Note`,
 * and each note with its author's initials, time and text. It lists the notes and verdicts the
 * caller can see on one object (`listObjectAnnotations`); adding a note, recording a verdict and
 * editing or deleting a note are offered only when the envelope's actions and the caller's scopes
 * allow them (a verdict needs agent scope; a note is changed by its author or an admin).
 */
export function AnnotationsPanel({
  api,
  objectRef,
  actions,
  heading = 'Analysis Notes',
}: AnnotationsPanelProps) {
  const [read, setRead] = useState<Read>();
  const [caller, setCaller] = useState<Me>();
  const [scope, setScope] = useState<NoteScope>('all');
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string>();
  // What was read for another object is not shown while this one's is read.
  const current = read?.ref === objectRef ? read : undefined;
  const notes = current?.notes ?? NO_NOTES;
  const state: Notes = current?.state ?? { status: 'loading' };
  const authors = useAuthors(api, notes, caller);

  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    listAnnotations(api, objectRef, controller.signal).then(
      (list) =>
        !controller.signal.aborted &&
        setRead({ ref: objectRef, notes: list, state: { status: 'ready' } }),
      (error: unknown) =>
        !controller.signal.aborted &&
        setRead({
          ref: objectRef,
          notes: [],
          state: { status: 'error', message: messageOf(error) },
        }),
    );
    getCaller(api).then(
      (me) => !controller.signal.aborted && setCaller(me),
      () => undefined,
    );
    return () => controller.abort();
  }, [api, objectRef]);

  const { canNote, canVerdict } = notePermissions(actions, caller);
  const shown = scopeNotes(notes, scope, caller?.principal.id);
  /** Runs a write; its answer replaces or adds the note, and a failure is shown. */
  const write = async (run: () => Promise<Annotation | undefined>, removed?: string) => {
    setProblem(undefined);
    try {
      const note = await run();
      setRead((last) => {
        if (last?.ref !== objectRef) return last;
        const rest = last.notes.filter((entry) => entry.id !== (note?.id ?? removed));
        return { ...last, notes: note ? [note, ...rest] : rest };
      });
      return true;
    } catch (error) {
      setProblem(messageOf(error));
      return false;
    }
  };

  return (
    <section className={styles.panel} aria-label={heading}>
      <div className={styles.head}>
        <h2 className={styles.heading}>{heading}</h2>
        {canNote && api && !adding && (
          <Button icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add Note
          </Button>
        )}
      </div>
      <Tabs
        items={NOTE_SCOPES.map((entry) => ({
          key: entry.key,
          label:
            state.status === 'ready'
              ? `${entry.label} (${scopeNotes(notes, entry.key, caller?.principal.id).length})`
              : entry.label,
        }))}
        value={scope}
        onChange={setScope}
        label="Notes"
        variant="pill"
      />
      {adding && api && (
        <NoteForm
          onCancel={() => setAdding(false)}
          onSave={async (body, isPrivate) => {
            if (await write(() => createNote(api, objectRef, body, isPrivate))) setAdding(false);
          }}
        />
      )}
      {canVerdict && api && (
        <VerdictForm
          onRecord={(verdict, duplicateOf) =>
            write(() => createVerdict(api, objectRef, verdict, undefined, duplicateOf))
          }
        />
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      {state.status === 'loading' && <p className={styles.muted}>Loading notes…</p>}
      {state.status === 'error' && <p className={styles.muted}>{notesProblem(state.message)}</p>}
      {state.status === 'ready' && shown.length === 0 && (
        <p className={styles.muted}>
          {scope === 'mine' ? 'You have no notes here.' : 'No notes yet.'}
        </p>
      )}
      {state.status === 'ready' && shown.length > 0 && (
        <ul className={styles.list} data-testid="annotations">
          {shown.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              author={authors.get(note.author)}
              changeable={canChange(note, caller) && api !== undefined}
              onEdit={(body) =>
                api ? write(() => updateAnnotation(api, note.id, { body })) : Promise.resolve(false)
              }
              onDelete={() =>
                api
                  ? write(async () => {
                      await deleteAnnotation(api, note.id);
                      return undefined;
                    }, note.id)
                  : Promise.resolve(false)
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The display names of the notes' authors, read once each; the caller's own from `getMe`. */
function useAuthors(
  api: ForesignalClient | undefined,
  notes: readonly Annotation[],
  caller: Me | undefined,
): ReadonlyMap<string, string> {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const wanted = [...new Set(notes.map((note) => note.author))].sort().join(',');
  useEffect(() => {
    if (!api || !wanted) return;
    let live = true;
    for (const id of wanted.split(',')) {
      getAuthor(api, id).then(
        (principal) => {
          const name = principal.displayName ?? principal.handle;
          if (live && name) setNames((known) => new Map(known).set(id, name));
        },
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
  }, [api, wanted]);
  if (!caller) return names;
  return new Map(names).set(caller.principal.id, caller.principal.displayName);
}

/** The form a new note is written in. */
function NoteForm({
  onSave,
  onCancel,
}: {
  onSave: (body: string, isPrivate: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    await onSave(body.trim(), isPrivate);
    setSaving(false);
  };
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <textarea
        className={styles.textarea}
        aria-label="New note"
        placeholder="Write a note…"
        maxLength={10_000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className={styles.formRow}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(event) => setPrivate(event.target.checked)}
          />
          Private
        </label>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={saving || !body.trim()}>
          Save note
        </Button>
      </div>
    </form>
  );
}

/** The verdict a caller with agent scope may record, in the backend's words. */
function VerdictForm({
  onRecord,
}: {
  onRecord: (verdict: Verdict, duplicateOf?: string) => Promise<boolean>;
}) {
  const [verdict, setVerdict] = useState<Verdict>('confirmed');
  const [duplicateOf, setDuplicateOf] = useState('');
  const needsRef = verdict === 'duplicate-of';
  return (
    <form
      className={styles.formRow}
      aria-label="Verdict"
      onSubmit={(event) => {
        event.preventDefault();
        void onRecord(verdict, needsRef ? duplicateOf.trim() : undefined);
      }}
    >
      <select
        className={styles.select}
        aria-label="Verdict"
        value={verdict}
        onChange={(event) => setVerdict(event.target.value as Verdict)}
      >
        {VERDICTS.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      {needsRef && (
        <input
          className={styles.input}
          aria-label="Duplicate of"
          placeholder="record:source/id"
          value={duplicateOf}
          onChange={(event) => setDuplicateOf(event.target.value)}
        />
      )}
      <Button type="submit" disabled={needsRef && !duplicateOf.trim()}>
        Record verdict
      </Button>
    </form>
  );
}

/** One note: initials, author, time, text, its verdict and privacy; edit and delete if allowed. */
function NoteRow({
  note,
  author,
  changeable,
  onEdit,
  onDelete,
}: {
  note: Annotation;
  author: string | undefined;
  changeable: boolean;
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body ?? '');
  const [confirming, setConfirming] = useState(false);
  const name = author ?? note.author;
  return (
    <li className={styles.note} data-annotation={note.id}>
      <span className={styles.avatar} title={name} aria-hidden="true">
        {initials(author)}
      </span>
      <div className={styles.noteBody}>
        <div className={styles.noteMeta}>
          <strong>{name}</strong>
          <span className={styles.muted}>{utcText(note.createdAt)}</span>
          {note.editedAt && <span className={styles.muted}>edited</span>}
          {note.kind === 'verdict' && note.verdict && (
            <Badge tone="info" uppercase={false}>
              {note.verdict}
            </Badge>
          )}
          {note.private && <Badge uppercase={false}>private</Badge>}
        </div>
        {editing ? (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void onEdit(draft.trim()).then((saved) => saved && setEditing(false));
            }}
          >
            <textarea
              className={styles.textarea}
              aria-label="Edit note"
              maxLength={10_000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className={styles.formRow}>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={!draft.trim()}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          note.body && <p className={styles.text}>{note.body}</p>
        )}
        {confirming && (
          <div className={styles.formRow} role="group" aria-label="Confirm delete">
            <span>Delete this note?</span>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button variant="primary" onClick={() => void onDelete()}>
              Delete
            </Button>
          </div>
        )}
      </div>
      {changeable && !editing && !confirming && (
        <span className={styles.noteActions}>
          {note.kind === 'note' && (
            <IconButton
              label="Edit note"
              icon={<Pencil size={13} />}
              onClick={() => {
                setDraft(note.body ?? '');
                setEditing(true);
              }}
            />
          )}
          <IconButton
            label="Delete note"
            icon={<Trash2 size={13} />}
            onClick={() => setConfirming(true)}
          />
        </span>
      )}
    </li>
  );
}

/** What a failed notes read says. */
function notesProblem(message: string): string {
  return /token|unauthori[sz]ed/i.test(message)
    ? 'Notes need an access token. Add one in Settings.'
    : message;
}
