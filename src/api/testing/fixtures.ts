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
    roles?: components['schemas']['RoleRef'][];
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
      roles: overrides.roles ?? [],
      mfaEnabled: false,
    },
    token: { id: '00000000-0000-4000-8000-0000000000bb', name: 'session', scope: 'read' },
    scopes: overrides.scopes ?? [],
    permissions: overrides.permissions ?? [],
    groups: [],
    notificationPreferences: [],
  };
}

/** A minimal valid `login` result (`SessionToken`); override `token`/`mfaRequired`/expiry per test. */
export function sessionToken(
  overrides: Partial<components['schemas']['SessionToken']> = {},
): components['schemas']['SessionToken'] {
  return {
    token: 'fss_live',
    tokenPrefix: 'fss_',
    userId: '00000000-0000-4000-8000-0000000000aa',
    issuedAt: '2026-10-29T00:00:00Z',
    expiresAt: '2026-11-01T00:00:00Z',
    idleExpiresAt: null,
    mfaRequired: false,
    scopes: ['read'],
    permissions: [],
    ...overrides,
  };
}

/** A minimal valid `UserPreferences` body; override any field per test. */
export function userPreferences(
  overrides: Partial<components['schemas']['UserPreferences']> = {},
): components['schemas']['UserPreferences'] {
  return {
    timezone: null,
    locale: null,
    theme: 'system',
    notifications: { emailEnabled: true, pushEnabled: true, quietHours: null },
    ui: {},
    ...overrides,
  };
}

/** A minimal valid active `Session` (`listSessions` item); override any field per test. */
export function userSession(
  overrides: Partial<components['schemas']['Session']> = {},
): components['schemas']['Session'] {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    tokenPrefix: 'fss_',
    createdAt: '2026-10-28T00:00:00Z',
    lastSeenAt: '2026-10-29T00:00:00Z',
    expiresAt: '2026-11-04T00:00:00Z',
    idleExpiresAt: null,
    userAgent: 'Test Browser',
    ipAddress: '203.0.113.7',
    current: false,
    ...overrides,
  };
}

/** A minimal valid `ApiToken` (no secret); override any field per test. */
export function apiToken(
  overrides: Partial<components['schemas']['ApiToken']> = {},
): components['schemas']['ApiToken'] {
  return {
    id: '00000000-0000-4000-8000-0000000000f1',
    name: 'Laptop CLI',
    scope: 'read',
    tokenPrefix: 'fsr_AbC1',
    createdAt: '2026-10-20T00:00:00Z',
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

/** A freshly minted token (`createMyToken` → `ApiTokenCreated`) carrying its one-time secret. */
export function apiTokenCreated(
  overrides: Partial<components['schemas']['ApiTokenCreated']> = {},
): components['schemas']['ApiTokenCreated'] {
  return { ...apiToken(), token: 'fsr_AbC1secretvalue', ...overrides };
}

/** A minimal valid `UserSourceView`; pass the per-source prefs to show. */
export function userSourceView(
  sources: components['schemas']['UserSourcePref'][] = [
    { sourceId: 'usgs-earthquakes', enabled: true, displayName: null, color: null },
    { sourceId: 'nws-alerts', enabled: true, displayName: null, color: null },
  ],
): components['schemas']['UserSourceView'] {
  return { sources };
}

/** A minimal valid `QuotaUsage`; override quota or usage per test. */
export function quotaUsage(
  overrides: Partial<components['schemas']['QuotaUsage']> = {},
): components['schemas']['QuotaUsage'] {
  return {
    quota: {
      maxAlerts: 10,
      maxChannels: 5,
      maxSavedViews: 20,
      maxStorageBytes: null,
      ...overrides.quota,
    },
    usage: { alerts: 3, channels: 1, savedViews: 4, storageBytes: 2048, ...overrides.usage },
  };
}

/** A minimal valid `MeLlmBudget`; override per test. */
export function meLlmBudget(
  overrides: Partial<components['schemas']['MeLlmBudget']> = {},
): components['schemas']['MeLlmBudget'] {
  return {
    providers: [
      {
        providerId: 'shared-1',
        name: 'Shared GPT',
        shared: true,
        capUsd: null,
        spentUsd: 1.25,
        remainingUsd: null,
      },
    ],
    totalSpentUsd: 1.25,
    asOf: '2026-10-29T00:00:00Z',
    ...overrides,
  };
}

/** A minimal valid `SourceRelevanceAnalysis`; override per test. */
export function sourceRelevanceAnalysis(
  overrides: Partial<components['schemas']['SourceRelevanceAnalysis']> = {},
): components['schemas']['SourceRelevanceAnalysis'] {
  return {
    advisory: true,
    summary: 'These sources watch earthquakes and severe weather.',
    sources: [
      {
        sourceId: 'usgs-earthquakes',
        name: 'USGS Earthquakes',
        kinds: ['earthquake'],
        verdict: 'relevant',
        reason: 'Core seismic feed for the set.',
      },
      {
        sourceId: 'nws-alerts',
        name: 'NWS Alerts',
        kinds: ['weather-alert'],
        verdict: 'marginal',
        reason: 'Related hazards but a different domain.',
      },
    ],
    shared: { kinds: [], entityTypes: [] },
    model: 'test-model',
    template: { templateId: 'source-relevance-system', version: '1.0.0' },
    ...overrides,
  };
}

/** A minimal valid `NotificationPreference` row; override any field per test. */
export function notificationPreference(
  overrides: Partial<components['schemas']['NotificationPreference']> = {},
): components['schemas']['NotificationPreference'] {
  return {
    id: '01J0000000000000000000000N',
    eventTypes: ['mention'],
    channel: { type: 'email' },
    quietHours: null,
    enabled: true,
    ...overrides,
  };
}
