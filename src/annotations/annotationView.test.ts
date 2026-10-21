import { canChange, canRelate, initials, notePermissions, scopeNotes } from './annotationView';
import {
  ANNOTATE_ACTION,
  me,
  ME_ID,
  note,
  NOTES,
  OTHER_ID,
  RELATE_ACTION,
} from './testing/annotationFixtures';

const ids = (list: { id: string }[]) => list.map((entry) => entry.id.slice(-3));

describe('the notes view', () => {
  it('scopes notes to All, My and Shared, newest first, without deleted ones or replies', () => {
    const notes = [...NOTES, note('01JA8Q00000000000000000N05', { parentId: NOTES[0]!.id })];
    expect(ids(scopeNotes(notes, 'all', ME_ID))).toEqual(['N02', 'N01', 'N03']);
    expect(ids(scopeNotes(notes, 'mine', ME_ID))).toEqual(['N01', 'N03']);
    expect(ids(scopeNotes(notes, 'shared', ME_ID))).toEqual(['N02', 'N01']);
    // Without a caller, nothing is the caller's own.
    expect(scopeNotes(notes, 'mine', undefined)).toEqual([]);
  });

  it('writes initials from a name', () => {
    expect(initials('Dana Reyes')).toBe('DR');
    expect(initials('Mary Ann de la Cruz')).toBe('MC');
    expect(initials('ops')).toBe('OP');
    expect(initials('sam.okafor')).toBe('SO');
    expect(initials(undefined)).toBe('?');
  });

  it('offers notes from the envelope, and verdicts only with agent scope', () => {
    expect(notePermissions([ANNOTATE_ACTION], me('read'))).toEqual({
      canNote: true,
      canVerdict: false,
    });
    expect(notePermissions([ANNOTATE_ACTION], me('agent'))).toEqual({
      canNote: true,
      canVerdict: true,
    });
    expect(notePermissions([], me('admin'))).toEqual({ canNote: false, canVerdict: false });
    expect(notePermissions(undefined, undefined)).toEqual({ canNote: false, canVerdict: false });
  });

  it('lets the author or an admin change a note', () => {
    const mine = note('A');
    const theirs = note('B', { author: OTHER_ID });
    expect(canChange(mine, me())).toBe(true);
    expect(canChange(theirs, me())).toBe(false);
    expect(canChange(theirs, me('admin'))).toBe(true);
    expect(canChange(mine, undefined)).toBe(false);
  });

  it('offers relations only when the envelope does', () => {
    expect(canRelate([RELATE_ACTION])).toBe(true);
    expect(canRelate([ANNOTATE_ACTION])).toBe(false);
    expect(canRelate(undefined)).toBe(false);
  });
});
