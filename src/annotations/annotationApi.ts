import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';
import type { Relation } from '../graph/graphApi';

/** A note or verdict on an object (`Annotation`). */
export type Annotation = components['schemas']['Annotation'];

/** A verdict the backend takes: `confirmed`, `rejected`, `needs-review` or `duplicate-of`. */
export type Verdict = NonNullable<components['schemas']['AnnotationInput']['verdict']>;

/** The fields of an annotation its author may change (`AnnotationPatch`, a JSON merge patch). */
export type AnnotationPatch = components['schemas']['AnnotationPatch'];

/** An operator relation to draw (`RelationInput`). */
export type RelationInput = components['schemas']['RelationInput'];

/** The calling principal, its token and effective scopes (`Me`). */
export type Me = components['schemas']['Me'];

/** A principal as another principal sees it (`getPrincipal`'s summary). */
export type PrincipalSummary = { id: string; handle?: string; displayName?: string };

/** Every verdict the backend takes, in the OpenAPI's order. */
export const VERDICTS: readonly Verdict[] = [
  'confirmed',
  'rejected',
  'needs-review',
  'duplicate-of',
];

/** The most annotations one read returns (`listObjectAnnotations`' maximum page). */
export const ANNOTATIONS_PAGE = 500;

/** The notes and verdicts on an object that the caller can see, as a flat list. */
export async function listAnnotations(
  api: ForesignalClient,
  ref: string,
  signal?: AbortSignal,
): Promise<Annotation[]> {
  const list = await unwrap(
    api.GET('/v1/objects/{ref}/annotations', {
      params: { path: { ref }, query: { limit: ANNOTATIONS_PAGE } },
      signal,
    }),
  );
  // A flat list is asked for; a thread list is flattened to its roots and replies.
  return (list as (Annotation | components['schemas']['AnnotationThread'])[]).flatMap((entry) =>
    'root' in entry ? [entry.root, ...entry.replies] : [entry],
  );
}

/** Adds a note to an object (`createAnnotation`, `kind: note`; read scope may). */
export function createNote(
  api: ForesignalClient,
  ref: string,
  body: string,
  isPrivate = false,
): Promise<Annotation> {
  return unwrap(
    api.POST('/v1/objects/{ref}/annotations', {
      params: { path: { ref } },
      body: { kind: 'note', body, private: isPrivate, applyStatus: false },
    }),
  );
}

/** Records a verdict on an object (`createAnnotation`, `kind: verdict`; agent scope). */
export function createVerdict(
  api: ForesignalClient,
  ref: string,
  verdict: Verdict,
  body?: string,
  duplicateOfRef?: string,
): Promise<Annotation> {
  return unwrap(
    api.POST('/v1/objects/{ref}/annotations', {
      params: { path: { ref } },
      body: {
        kind: 'verdict',
        verdict,
        private: false,
        applyStatus: false,
        ...(body && { body }),
        ...(verdict === 'duplicate-of' && duplicateOfRef && { duplicateOfRef }),
      },
    }),
  );
}

/** Changes an annotation by a JSON merge patch (`updateAnnotation`; its author or an admin). */
export function updateAnnotation(
  api: ForesignalClient,
  id: string,
  patch: AnnotationPatch,
): Promise<Annotation> {
  return unwrap(
    api.PATCH('/v1/annotations/{annotationId}', {
      params: { path: { annotationId: id } },
      body: patch,
      headers: { 'Content-Type': 'application/merge-patch+json' },
    }),
  );
}

/** Soft-deletes an annotation (`deleteAnnotation`; its author or an admin). */
export async function deleteAnnotation(api: ForesignalClient, id: string): Promise<void> {
  await unwrap(
    api.DELETE('/v1/annotations/{annotationId}', { params: { path: { annotationId: id } } }),
  );
}

/** Draws an operator relation between two objects (`createRelation`; agent scope). */
export function createRelation(api: ForesignalClient, input: RelationInput): Promise<Relation> {
  return unwrap(api.POST('/v1/relations', { body: input }));
}

/** Retires an operator relation (`deleteRelation`; a projected one answers 409). */
export async function deleteRelation(api: ForesignalClient, id: string): Promise<void> {
  await unwrap(api.DELETE('/v1/relations/{relationId}', { params: { path: { relationId: id } } }));
}

/** The caller, read once per client: which notes are its own and which actions its scopes allow. */
const callers = new WeakMap<ForesignalClient, Promise<Me>>();

/** The calling principal (`getMe`), read once per client; a failed read is tried again next time. */
export function getCaller(api: ForesignalClient): Promise<Me> {
  const known = callers.get(api);
  if (known) return known;
  const read = unwrap(api.GET('/v1/me', {}));
  callers.set(api, read);
  read.catch(() => callers.delete(api));
  return read;
}

/** Principals read so far, per client, by id. */
const principals = new WeakMap<ForesignalClient, Map<string, Promise<PrincipalSummary>>>();

/** A note's author by principal id (`getPrincipal`), read once per client and id. */
export function getAuthor(api: ForesignalClient, id: string): Promise<PrincipalSummary> {
  let known = principals.get(api);
  if (!known) {
    known = new Map();
    principals.set(api, known);
  }
  const kept = known.get(id);
  if (kept) return kept;
  const read = unwrap(
    api.GET('/v1/principals/{principalId}', { params: { path: { principalId: id } } }),
  ) as Promise<PrincipalSummary>;
  known.set(id, read);
  const map = known;
  read.catch(() => map.delete(id));
  return read;
}
