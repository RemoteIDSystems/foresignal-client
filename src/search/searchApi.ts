import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';
import { recordRef } from '../lib/objectRef';

/** One search hit (`SearchResult`): a record, a briefing or an alert. */
export type SearchResult = components['schemas']['SearchResult'];

/** A search's results (`SearchResults`): the mode used, and why it fell back to text if it did. */
export type SearchResults = components['schemas']['SearchResults'];

/** Whether semantic search is ready (`SearchStatus`). */
export type SearchStatus = components['schemas']['SearchStatus'];

/** The result groups the drop-down shows, in order. */
export const SEARCH_GROUPS = ['record', 'briefing', 'alert'] as const;

/** One of {@link SEARCH_GROUPS}. */
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

/** The most results one search asks for. */
export const SEARCH_LIMIT = 20;

/**
 * Searches records, briefings and alerts (`search`). The mode is `hybrid` when semantic search is
 * ready and `text` otherwise, so a query never asks for a mode the backend says it cannot serve.
 */
export function searchAll(
  api: ForesignalClient,
  q: string,
  semantic: boolean,
  signal?: AbortSignal,
): Promise<SearchResults> {
  return unwrap(
    api.GET('/v1/search', {
      params: { query: { q, mode: semantic ? 'hybrid' : 'text', limit: SEARCH_LIMIT } },
      signal,
    }),
  ) as Promise<SearchResults>;
}

/** Whether semantic search is ready (`getSearchStatus`); open, so it answers without a token. */
export function searchStatus(api: ForesignalClient, signal?: AbortSignal): Promise<SearchStatus> {
  return unwrap(api.GET('/v1/search/status', { signal }));
}

/** Results grouped by type, each group in the backend's (ranked) order; empty groups left out. */
export function groupResults(
  items: readonly SearchResult[],
): { group: SearchGroup; items: SearchResult[] }[] {
  return SEARCH_GROUPS.map((group) => ({
    group,
    items: items.filter((item) => item.docType === group),
  })).filter((entry) => entry.items.length > 0);
}

/**
 * The object ref a result selects: a record's from its source and external id; a briefing or
 * alert is `briefing:<id>` or `alert:<id>`. Undefined for a record without its source.
 */
export function resultRef(result: SearchResult): string | undefined {
  if (result.docType !== 'record') return `${result.docType}:${result.docId}`;
  const source = result.record?.source ?? result.source;
  const externalId = result.record?.externalId;
  if (source && externalId) return recordRef(source, externalId);
  return undefined;
}

/** A result's snippet as plain text: the backend's highlight tags are dropped. */
export function plainSnippet(snippet: string | undefined): string {
  return (snippet ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
