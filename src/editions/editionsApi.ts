import { unwrap, type ForesignalClient } from '../api/client';
import { toFsError } from '../api/errors';
import type { components } from '../api/generated/schema';

/** One of the signed-in caller's editions (`listMyEditions`): a briefing they own. */
export type EditionSummary = components['schemas']['EditionSummary'];

/** Where an edition's hosted site is reachable (`getEditionSite`): canonical, feed-key and share URLs. */
export type EditionSite = components['schemas']['EditionSite'];

/** A completed run of an edition (`getLatestBriefingRun`): the written body, citations and audio. */
export type BriefingRun = components['schemas']['BriefingRun'];

/** One citation of a run (`AskCitation`), carrying provenance/corroboration when the run includes them. */
export type EditionCitation = components['schemas']['AskCitation'];

/**
 * The body of a self-service create/update (`BriefingInput`): the edition's feed/scope, schedule,
 * output language, sections and delivery targets. `ownerUserId` is forced to the caller by the
 * backend on the `/v1/me/editions` operations, so the client never sends another user's id (NP-003).
 */
export type BriefingInput = components['schemas']['BriefingInput'];

/** A created or updated edition as the backend stores it (`Briefing`), returned by the self-service writes. */
export type Briefing = components['schemas']['Briefing'];

/** The caller's editions and the opaque cursor for the next page (`null` when there is no more). */
export interface MyEditions {
  /** The editions in this page. */
  items: EditionSummary[];
  /** The cursor to pass as `cursor` for the next page, or `null`/absent at the end. */
  nextCursor?: string | null;
}

/** An audio enclosure parsed from an edition's podcast feed (`getBriefingPodcast`). */
export interface PodcastEnclosure {
  /** The audio file URL to play. */
  url: string;
  /** The enclosure MIME type (e.g. `audio/mpeg`), or `''` when the feed omits it. */
  type: string;
  /** The enclosing item's title, or `null` when the feed omits it. */
  title: string | null;
}

/** Reads a page of the signed-in caller's editions. */
export function listMyEditions(
  api: ForesignalClient,
  query?: { cursor?: string; limit?: number },
  signal?: AbortSignal,
): Promise<MyEditions> {
  return unwrap(api.GET('/v1/me/editions', { params: { query: query ?? {} }, signal }));
}

/**
 * Creates an edition the signed-in caller owns (`createMyEdition`, 2.1.1, `self.editions`). The body
 * is a {@link BriefingInput}; `ownerUserId` is forced to the caller by the backend, so none is sent.
 * Returns the stored {@link Briefing}.
 */
export function createMyEdition(api: ForesignalClient, body: BriefingInput): Promise<Briefing> {
  return unwrap(api.POST('/v1/me/editions', { body }));
}

/**
 * Replaces an edition the signed-in caller owns (`updateMyEdition`, 2.1.1, `self.editions`). The body
 * is a full {@link BriefingInput} (PUT replaces, not merges); 404 unless the edition exists and the
 * caller owns it. Returns the stored {@link Briefing}.
 */
export function updateMyEdition(
  api: ForesignalClient,
  briefingId: string,
  body: BriefingInput,
): Promise<Briefing> {
  return unwrap(
    api.PUT('/v1/me/editions/{briefingId}', { params: { path: { briefingId } }, body }),
  );
}

/**
 * Deletes an edition the signed-in caller owns (`deleteMyEdition`, 2.1.1, `self.editions`). 204 on
 * success; 404 unless the edition exists and the caller owns it.
 */
export async function deleteMyEdition(api: ForesignalClient, briefingId: string): Promise<void> {
  const { error, response } = await api.DELETE('/v1/me/editions/{briefingId}', {
    params: { path: { briefingId } },
  });
  if (!response.ok) throw toFsError(response, error);
}

/**
 * Runs an edition the signed-in caller owns on demand (`runMyEdition`, 2.1.1, `self.editions`),
 * producing a run delivered to the edition's targets. 202 with the started {@link BriefingRun}; 404
 * unless the edition exists and the caller owns it.
 */
export function runMyEdition(api: ForesignalClient, briefingId: string): Promise<BriefingRun> {
  return unwrap(api.POST('/v1/me/editions/{briefingId}/run', { params: { path: { briefingId } } }));
}

/**
 * Reads the current written edition (the latest completed run) of a briefing, as JSON.
 *
 * The 200 response is `oneOf [BriefingRun (json), string (html)]`, so `openapi-typescript` types the
 * body as `string | BriefingRun`; requesting `format: 'json'` always yields the JSON member, which is
 * narrowed here. (The `?format=html` page is the backend's own rendering; this client renders the
 * `contentMarkdown` with its own Markdown chrome instead.)
 */
export async function getLatestBriefingRun(
  api: ForesignalClient,
  briefingId: string,
  signal?: AbortSignal,
): Promise<BriefingRun> {
  const body = await unwrap(
    api.GET('/v1/briefings/{briefingId}/runs/latest', {
      params: { path: { briefingId }, query: { format: 'json' } },
      signal,
    }),
  );
  return body as BriefingRun;
}

/**
 * Reads where an edition's hosted site is reachable (canonical / feed-key / share URLs).
 *
 * As with {@link getLatestBriefingRun}, the 200 body is `string (html) | EditionSite (json)`;
 * `format: 'json'` yields the JSON member, narrowed here.
 */
export async function getEditionSite(
  api: ForesignalClient,
  briefingId: string,
  signal?: AbortSignal,
): Promise<EditionSite> {
  const body = await unwrap(
    api.GET('/v1/editions/{briefingId}/site', {
      params: { path: { briefingId }, query: { format: 'json' } },
      signal,
    }),
  );
  return body as EditionSite;
}

/**
 * Reads an edition's podcast feed as RSS text (the spoken edition). The feed is XML, not JSON, so it
 * is parsed as text here and turned into enclosures with {@link latestEnclosure}.
 */
export async function getBriefingPodcast(
  api: ForesignalClient,
  briefingId: string,
  signal?: AbortSignal,
): Promise<string> {
  const { data, error, response } = await api.GET('/v1/briefings/{briefingId}/podcast.rss', {
    params: { path: { briefingId } },
    parseAs: 'text',
    signal,
  });
  if (!response.ok) throw toFsError(response, error);
  return (data as unknown as string | undefined) ?? '';
}

/**
 * The share URL to copy for an edition: its revocable read-only share link when it has one, else the
 * canonical site URL. `null` when neither is present (hosting off), so the caller can omit the share
 * affordance cleanly.
 */
export function shareUrlOf(site: EditionSite | null | undefined): string | null {
  if (!site) return null;
  return site.shareUrl ?? site.url ?? null;
}

/**
 * The newest audio enclosure in a podcast RSS feed, or `null` when the feed has none (or does not
 * parse). The feed lists items newest-first, so the first item's `<enclosure>` is the latest spoken
 * edition. Parsing never throws: a malformed feed yields `null`, and the caller omits the player.
 */
export function latestEnclosure(rss: string): PodcastEnclosure | null {
  if (!rss.trim()) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(rss, 'application/xml');
  } catch {
    return null;
  }
  // A parse error surfaces as a <parsererror> element rather than a thrown exception.
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const item = doc.querySelector('item');
  const enclosure = (item ?? doc).querySelector('enclosure');
  const url = enclosure?.getAttribute('url')?.trim();
  if (!url) return null;
  return {
    url,
    type: enclosure?.getAttribute('type')?.trim() ?? '',
    title: item?.querySelector('title')?.textContent?.trim() || null,
  };
}
