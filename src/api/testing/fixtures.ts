import type { components } from '../generated/schema';

/** A minimal valid `getSystem` body reporting the given API version. */
export function systemInfo(apiVersion = '2.0.0'): components['schemas']['SystemInfo'] {
  return {
    version: '2.0.0',
    apiVersion,
    startedAt: '2026-10-19T00:00:00Z',
    status: 'ok',
    security: { openReads: true },
  };
}

/** A minimal valid `getContract` body. */
export function contract(): components['schemas']['Contract'] {
  return {
    contractVersion: '1.5',
    objectTypes: ['record'],
    relationTypes: ['related-to'],
    contextSchemaVersion: 1,
    deepLinkVersion: 1,
  };
}

/**
 * A minimal valid `getMe` body for a signed-in analyst, with the given effective permissions and
 * scopes (both default to empty, as for an anonymous or non-login principal).
 */
export function me(
  overrides: {
    permissions?: string[];
    scopes?: components['schemas']['Me']['scopes'];
  } = {},
): components['schemas']['Me'] {
  return {
    principal: {
      id: '01J0000000000000000000000A',
      handle: 'analyst',
      displayName: 'Test Analyst',
      kind: 'person',
      disabled: false,
      createdAt: '2026-10-19T00:00:00Z',
    },
    user: {
      id: '00000000-0000-4000-8000-0000000000aa',
      email: 'analyst@example.test',
      fullName: 'Test Analyst',
      status: 'active',
      roles: [],
      mfaEnabled: false,
    },
    token: { id: '00000000-0000-4000-8000-0000000000bb', name: 'session', scope: 'read' },
    scopes: overrides.scopes ?? [],
    permissions: overrides.permissions ?? [],
    groups: [],
    notificationPreferences: [],
  };
}
