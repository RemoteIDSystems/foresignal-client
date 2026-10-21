import { json, standInApi } from '../intel/testing/standIn';
import {
  createNote,
  createRelation,
  createVerdict,
  deleteAnnotation,
  deleteRelation,
  getAuthor,
  getCaller,
  listAnnotations,
  updateAnnotation,
} from './annotationApi';
import { me, note, NOTED_REF, NOTES, OTHER_ID } from './testing/annotationFixtures';

const notesPath = `/v1/objects/${encodeURIComponent(NOTED_REF)}/annotations`;
const noteId = NOTES[0]!.id;

describe('the annotation reads and writes', () => {
  it('lists an object’s notes as a flat list, threads flattened', async () => {
    const { api, asked } = standInApi({
      [`GET ${notesPath}`]: () =>
        json([
          NOTES[0],
          {
            root: NOTES[1],
            replies: [note('R1', { parentId: NOTES[1]!.id })],
            replyCount: 1,
            resolved: false,
            lastActivityAt: '2026-10-19T09:00:00Z',
          },
        ]),
    });
    const list = await listAnnotations(api, NOTED_REF);
    expect(list.map((entry) => entry.id)).toEqual([noteId, NOTES[1]!.id, 'R1']);
    expect(asked).toEqual([`GET ${notesPath}?limit=500`]);
  });

  it('adds a note and records a verdict', async () => {
    const { api, bodies } = standInApi({
      [`POST ${notesPath}`]: () => json(NOTES[0], 201),
    });
    await createNote(api, NOTED_REF, 'A note.', true);
    await createVerdict(api, NOTED_REF, 'duplicate-of', undefined, 'record:emsc/x1');
    await createVerdict(api, NOTED_REF, 'confirmed', 'Seen.', 'record:emsc/x1');
    expect(bodies).toEqual([
      { kind: 'note', body: 'A note.', private: true, applyStatus: false },
      {
        kind: 'verdict',
        verdict: 'duplicate-of',
        private: false,
        applyStatus: false,
        duplicateOfRef: 'record:emsc/x1',
      },
      { kind: 'verdict', verdict: 'confirmed', private: false, applyStatus: false, body: 'Seen.' },
    ]);
  });

  it('edits a note as a merge patch and deletes it', async () => {
    let type: string | null = null;
    const { api, asked, bodies } = standInApi({
      [`PATCH /v1/annotations/${noteId}`]: (request) => {
        type = request.headers.get('Content-Type');
        return json({ ...NOTES[0], body: 'Changed.' });
      },
      [`DELETE /v1/annotations/${noteId}`]: () => new Response(null, { status: 204 }),
    });
    expect((await updateAnnotation(api, noteId, { body: 'Changed.' })).body).toBe('Changed.');
    await deleteAnnotation(api, noteId);
    expect(asked).toEqual([`PATCH /v1/annotations/${noteId}`, `DELETE /v1/annotations/${noteId}`]);
    expect(bodies[0]).toEqual({ body: 'Changed.' });
    expect(type).toContain('application/merge-patch+json');
  });

  it('draws and retires an operator relation', async () => {
    const { api, asked, bodies } = standInApi({
      'POST /v1/relations': () => json({ id: 'REL1' }, 201),
      'DELETE /v1/relations/REL1': () => new Response(null, { status: 204 }),
    });
    await createRelation(api, {
      fromRef: NOTED_REF,
      toRef: 'facility:1',
      type: 'affects',
      confidence: 1,
      private: false,
    });
    await deleteRelation(api, 'REL1');
    expect(asked).toEqual(['POST /v1/relations', 'DELETE /v1/relations/REL1']);
    expect(bodies[0]).toEqual({
      fromRef: NOTED_REF,
      toRef: 'facility:1',
      type: 'affects',
      confidence: 1,
      private: false,
    });
  });

  it('reads the caller once per client, and again after a failure', async () => {
    let calls = 0;
    const { api } = standInApi({
      'GET /v1/me': () => {
        calls += 1;
        return calls === 1 ? json({ title: 'Unauthorized', status: 401 }, 401) : json(me());
      },
    });
    await expect(getCaller(api)).rejects.toThrow();
    await Promise.resolve();
    expect((await getCaller(api)).principal.handle).toBe('dana.reyes');
    await getCaller(api);
    expect(calls).toBe(2);
  });

  it('reads each author once per client', async () => {
    const { api, asked } = standInApi({
      [`GET /v1/principals/${OTHER_ID}`]: () =>
        json({ id: OTHER_ID, handle: 'sam', displayName: 'Sam Okafor' }),
    });
    expect((await getAuthor(api, OTHER_ID)).displayName).toBe('Sam Okafor');
    await getAuthor(api, OTHER_ID);
    expect(asked).toEqual([`GET /v1/principals/${OTHER_ID}`]);
  });
});
