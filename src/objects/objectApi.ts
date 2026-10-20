import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import { toFsError } from '../api/errors';
import type { components } from '../api/generated/schema';

/** The uniform summary of any object (`ObjectEnvelope`). */
export type ObjectEnvelope = components['schemas']['ObjectEnvelope'];

/** One action the calling token may take on an object (`ObjectAction`). */
export type ObjectAction = components['schemas']['ObjectAction'];

/** Everything the selected-object panel shows (`Dossier`). */
export type Dossier = components['schemas']['Dossier'];

/** The sections of a dossier, by name. */
export type DossierSections = Dossier['sections'];

/** What a dossier section says of itself: rendered, empty, failed, or not on this server. */
export type SectionStatus = 'ok' | 'empty' | 'unavailable' | 'not-installed';

/** Envelopes for many refs (`ObjectResolveResult`). */
export type ObjectResolveResult = components['schemas']['ObjectResolveResult'];

/** An object's envelope (`getObject`), as known now or, with `asOf`, at that instant. */
export function getObject(
  api: ForesignalClient,
  ref: string,
  asOf?: string,
  signal?: AbortSignal,
): Promise<ObjectEnvelope> {
  return unwrap(
    api.GET('/v1/objects/{ref}', {
      params: { path: { ref }, ...(asOf !== undefined && { query: { asOf } }) },
      signal,
    }),
  );
}

/**
 * Envelopes for up to 500 refs at once (`resolveObjects`); refs that do not exist or cannot be seen
 * are listed in `missing`, not raised.
 */
export function resolveObjects(
  api: ForesignalClient,
  refs: readonly string[],
  asOf?: string,
  signal?: AbortSignal,
): Promise<ObjectResolveResult> {
  return unwrap(
    api.POST('/v1/objects/resolve', {
      body: { refs: [...refs], ...(asOf !== undefined && { asOf }) },
      signal,
    }),
  );
}

/** Most dossiers kept for revalidation. */
const DOSSIER_CACHE_SIZE = 50;

/**
 * Reads objects' dossiers (`getObjectDossier`) and keeps the last {@link DOSSIER_CACHE_SIZE} with
 * their ETags: asking for one again sends `If-None-Match`, and the backend's 304 hands back the
 * kept copy, so re-reading a selected object when the live stream says its kind changed costs a
 * header, not a body. Reads of one dossier made while another is in flight share its answer, so
 * the panels showing the selected object (014, 016) make one request between them. One per API
 * client ({@link dossiersFor}).
 */
export class DossierSource {
  private readonly cache = new Map<string, { etag: string; dossier: Dossier }>();

  /** @param api The API client. */
  constructor(private readonly api: ForesignalClient) {}

  private readonly inFlight = new Map<string, Promise<Dossier>>();

  /**
   * An object's dossier, as known now or, with `asOf`, at that instant. A read of a dossier already
   * being read shares that request; `signal` cancels only this caller's wait.
   */
  load(ref: string, asOf?: string, signal?: AbortSignal): Promise<Dossier> {
    const key = `${ref}|${asOf ?? ''}`;
    let shared = this.inFlight.get(key);
    if (!shared) {
      shared = this.fetch(key, ref, asOf).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, shared);
    }
    return abortable(shared, signal);
  }

  private async fetch(key: string, ref: string, asOf: string | undefined): Promise<Dossier> {
    const kept = this.cache.get(key);
    const { data, error, response } = await this.api.GET('/v1/objects/{ref}/dossier', {
      params: {
        path: { ref },
        ...(asOf !== undefined && { query: { asOf } }),
        ...(kept && { header: { 'If-None-Match': kept.etag } }),
      },
    });
    if (response.status === 304 && kept) {
      this.remember(key, kept.etag, kept.dossier);
      return kept.dossier;
    }
    if (!response.ok || !data) throw toFsError(response, error);
    const etag = response.headers.get('ETag');
    if (etag) this.remember(key, etag, data);
    return data;
  }

  private remember(key: string, etag: string, dossier: Dossier): void {
    this.cache.delete(key);
    this.cache.set(key, { etag, dossier });
    while (this.cache.size > DOSSIER_CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
  }
}

/** A promise that also rejects, with an `AbortError`, when `signal` aborts first. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

const SOURCES = new WeakMap<ForesignalClient, DossierSource>();

/** The dossier source shared by everything using one API client. */
export function dossiersFor(api: ForesignalClient): DossierSource {
  let source = SOURCES.get(api);
  if (!source) {
    source = new DossierSource(api);
    SOURCES.set(api, source);
  }
  return source;
}
