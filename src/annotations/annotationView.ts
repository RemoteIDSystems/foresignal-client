import type { ObjectAction } from '../objects/objectApi';
import { envelopeAllows } from '../intel/analysisView';
import type { Annotation, Me } from './annotationApi';

/** The mock's three note filters: All Notes, My Notes and Shared. */
export type NoteScope = 'all' | 'mine' | 'shared';

/** The filters' tabs, in the mock's order and words. */
export const NOTE_SCOPES: readonly { key: NoteScope; label: string }[] = [
  { key: 'all', label: 'All Notes' },
  { key: 'mine', label: 'My Notes' },
  { key: 'shared', label: 'Shared' },
];

/**
 * The annotations a filter shows, newest first, without deleted ones or replies (threads are not
 * drawn). All is everything the backend returned to the caller; My is the caller's own; Shared is
 * everything not private, so visible to others with access, whoever wrote it.
 */
export function scopeNotes(
  annotations: readonly Annotation[],
  scope: NoteScope,
  callerId: string | undefined,
): Annotation[] {
  return annotations
    .filter((note) => !note.deletedAt && !note.parentId)
    .filter((note) =>
      scope === 'mine' ? note.author === callerId : scope === 'shared' ? !note.private : true,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Up to two initials from a name ("Dana Reyes" → "DR"; "ops" → "OP"); "?" for none. */
export function initials(name: string | undefined): string {
  const words = (name ?? '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
}

/** What the caller may do on an object's notes, from its envelope's actions and its token. */
export interface NotePermissions {
  /** The envelope offers `POST …/annotations`: notes may be added. */
  canNote: boolean;
  /** Notes may be added and the token has agent scope: verdicts may be recorded too. */
  canVerdict: boolean;
}

/**
 * The note actions to offer. The envelope's actions say what the calling token may do on the
 * object; a verdict needs agent scope as well (the backend answers 403 without it).
 */
export function notePermissions(
  actions: readonly ObjectAction[] | undefined,
  caller: Me | undefined,
): NotePermissions {
  const canNote = envelopeAllows(actions, 'POST', /\/annotations\/?$/);
  const scopes = caller?.scopes ?? [];
  return { canNote, canVerdict: canNote && scopes.some((scope) => scope !== 'read') };
}

/** Whether the caller may edit or delete a note: its author, or an admin. */
export function canChange(note: Annotation, caller: Me | undefined): boolean {
  if (!caller) return false;
  return note.author === caller.principal.id || caller.scopes.includes('admin');
}

/** Whether the envelope offers drawing an operator relation (`POST /v1/relations`). */
export function canRelate(actions: readonly ObjectAction[] | undefined): boolean {
  return envelopeAllows(actions, 'POST', /\/relations\/?$/);
}
