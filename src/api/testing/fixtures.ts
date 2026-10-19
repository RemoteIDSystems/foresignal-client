import type { components } from '../generated/schema';

/** A minimal valid `getSystem` body reporting the given API version. */
export function systemInfo(apiVersion = '1.0.0'): components['schemas']['SystemInfo'] {
  return {
    version: '1.0.0',
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
