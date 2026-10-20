import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';
import { toFsError } from '../api/errors';

/** An operator case file (`Investigation`). */
export type Investigation = components['schemas']['Investigation'];

/** An item pinned in an investigation (`InvestigationItem`). */
export type InvestigationItem = components['schemas']['InvestigationItem'];

/** An item to pin (`InvestigationItemInput`). */
export type InvestigationItemInput = components['schemas']['InvestigationItemInput'];

/** Changes to an investigation (`InvestigationPatch`). */
export type InvestigationPatch = components['schemas']['InvestigationPatch'];

/** A new investigation (`InvestigationInput`). */
export type InvestigationInput = components['schemas']['InvestigationInput'];

/** An intelligence event, with its members and log (`IntelligenceEvent`). */
export type IntelligenceEvent = components['schemas']['IntelligenceEvent'];

/** The formats an investigation exports to. */
export type ExportFormat = 'json' | 'md' | 'geojson';

/** Investigations the caller can see (`listInvestigations`; a token is always needed). */
export async function listInvestigations(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<Investigation[]> {
  const page = await unwrap(
    api.GET('/v1/investigations', { params: { query: { limit: 500 } }, signal }),
  );
  return page.items;
}

/** An investigation with its items and their snapshots (`getInvestigation`). */
export function getInvestigation(
  api: ForesignalClient,
  id: string,
  signal?: AbortSignal,
): Promise<Investigation> {
  return unwrap(
    api.GET('/v1/investigations/{investigationId}', {
      params: { path: { investigationId: id } },
      signal,
    }),
  );
}

/** Changes an investigation's title, status, summary or tags (`updateInvestigation`). */
export function updateInvestigation(
  api: ForesignalClient,
  id: string,
  patch: InvestigationPatch,
): Promise<Investigation> {
  return unwrap(
    api.PATCH('/v1/investigations/{investigationId}', {
      params: { path: { investigationId: id } },
      body: patch,
    }),
  );
}

/** Opens a new investigation (`createInvestigation`), owned by the caller. */
export function createInvestigation(
  api: ForesignalClient,
  input: InvestigationInput,
): Promise<Investigation> {
  return unwrap(api.POST('/v1/investigations', { body: input }));
}

/** Pins an item, with a snapshot taken now (`addInvestigationItem`). */
export function addInvestigationItem(
  api: ForesignalClient,
  id: string,
  item: InvestigationItemInput,
): Promise<InvestigationItem> {
  return unwrap(
    api.POST('/v1/investigations/{investigationId}/items', {
      params: { path: { investigationId: id } },
      body: item,
    }),
  );
}

/** Removes one item (`removeInvestigationItem`). */
export async function removeInvestigationItem(
  api: ForesignalClient,
  id: string,
  itemId: string,
): Promise<void> {
  await unwrap(
    api.DELETE('/v1/investigations/{investigationId}/items/{itemId}', {
      params: { path: { investigationId: id, itemId } },
    }),
  );
}

/**
 * An investigation exported as JSON, a Markdown report with citations, or GeoJSON
 * (`exportInvestigation`), as the file's text and its media type.
 */
export async function exportInvestigation(
  api: ForesignalClient,
  id: string,
  format: ExportFormat,
): Promise<{ text: string; type: string }> {
  const { data, error, response } = await api.GET('/v1/investigations/{investigationId}/export', {
    params: { path: { investigationId: id }, query: { format } },
    parseAs: 'text',
  });
  if (!response.ok) throw toFsError(response, error);
  return {
    text: (data as unknown as string | undefined) ?? '',
    type: response.headers.get('Content-Type') ?? 'application/octet-stream',
  };
}

/** An intelligence event with its members and log (`getIntelEvent`). */
export function getIntelEvent(
  api: ForesignalClient,
  id: string,
  signal?: AbortSignal,
): Promise<IntelligenceEvent> {
  return unwrap(
    api.GET('/v1/intel/events/{eventId}', { params: { path: { eventId: id } }, signal }),
  );
}
