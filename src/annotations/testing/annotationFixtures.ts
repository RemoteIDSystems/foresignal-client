import type { Annotation, Me } from '../annotationApi';

/** The calling principal's id in the stand-ins. */
export const ME_ID = '01JA8Q00000000000000000P01';

/** Another principal, whose notes the caller can see but not change. */
export const OTHER_ID = '01JA8Q00000000000000000P02';

/** The object the stand-in notes are on. */
export const NOTED_REF = 'record:usgs-earthquakes/nc1';

/** The caller as `getMe` returns it, with the given scope (read unless told otherwise). */
export function me(scope: 'read' | 'agent' | 'admin' = 'read'): Me {
  const scopes: Me['scopes'] =
    scope === 'admin'
      ? ['read', 'agent', 'admin']
      : scope === 'agent'
        ? ['read', 'agent']
        : ['read'];
  return {
    principal: {
      id: ME_ID,
      handle: 'dana.reyes',
      displayName: 'Dana Reyes',
      kind: 'person',
      disabled: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
    token: { id: '00000000-0000-4000-8000-000000000001', name: 'laptop', scope },
    scopes,
    groups: [],
    notificationPreferences: [],
  };
}

/** A note on {@link NOTED_REF}, by the caller unless told otherwise. */
export function note(id: string, extra: Partial<Annotation> = {}): Annotation {
  return {
    id,
    ref: `annotation:${id}`,
    targetRef: NOTED_REF,
    kind: 'note',
    body: `Note ${id}`,
    author: ME_ID,
    private: false,
    createdAt: '2026-10-18T12:00:00Z',
    updatedAt: '2026-10-18T12:00:00Z',
    ...extra,
  };
}

/** The stand-in notes: one of the caller's, one shared by another, one private, one deleted. */
export const NOTES: Annotation[] = [
  note('01JA8Q00000000000000000N01', {
    body: 'Swarm consistent with geothermal injection.',
    createdAt: '2026-10-18T12:00:00Z',
  }),
  note('01JA8Q00000000000000000N02', {
    author: OTHER_ID,
    body: 'USGS revised the magnitude.',
    createdAt: '2026-10-19T08:30:00Z',
  }),
  note('01JA8Q00000000000000000N03', {
    body: 'Check the plant schedule.',
    private: true,
    createdAt: '2026-10-17T09:00:00Z',
  }),
  note('01JA8Q00000000000000000N04', {
    body: 'Withdrawn.',
    deletedAt: '2026-10-19T00:00:00Z',
  }),
];

/** The note action an envelope offers when the caller may annotate the object. */
export const ANNOTATE_ACTION = {
  id: 'annotate',
  label: 'Annotate',
  method: 'POST',
  href: `/v1/objects/${encodeURIComponent(NOTED_REF)}/annotations`,
  scope: 'read',
} as const;

/** The relation action an envelope offers when the caller may draw relations. */
export const RELATE_ACTION = {
  id: 'relate',
  label: 'Relate',
  method: 'POST',
  href: '/v1/relations',
  scope: 'agent',
} as const;
