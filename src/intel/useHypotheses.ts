import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { getHypothesisSet, listHypothesisSets, type HypothesisSet } from './hypothesisApi';
import type { HypothesisScope } from './hypothesesView';
import type { Part } from './useEvidence';

/**
 * The one value a read returns while loading, so it is the same object on every render (an
 * effect or memo that lists the result does not run again for nothing).
 */
const LOADING = { status: 'loading' } as const;

/** The message of a failed read. */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'It did not load.');

/** The sets of a scope: a situation's linked sets, or the ones an investigation links. */
async function scopeSets(
  api: ForesignalClient,
  scope: HypothesisScope,
  signal: AbortSignal,
): Promise<HypothesisSet[]> {
  if ('situationId' in scope) {
    return listHypothesisSets(api, { situationId: scope.situationId }, signal);
  }
  return Promise.all(scope.setIds.map((id) => getHypothesisSet(api, id, signal)));
}

/**
 * Loads the hypothesis sets of an analysis (021), by its scope as JSON so a refreshed analysis
 * with the same scope does not read them again; nothing until the analysis has loaded.
 */
export function useHypothesisSets(
  api: ForesignalClient | undefined,
  scopeKey: string | undefined,
): Part<HypothesisSet[]> {
  return useRead(api, scopeKey, (client, key, signal) =>
    scopeSets(client, JSON.parse(key) as HypothesisScope, signal),
  );
}

/**
 * Reads one thing by a key (a set id, a scope) and keeps it as a {@link Part}: loading while
 * there is no key or the read is under way, then ready or failed. A new key or `version` reads
 * again; the read itself is taken as given on the first render.
 */
export function useRead<T>(
  api: ForesignalClient | undefined,
  key: string | undefined,
  read: (api: ForesignalClient, key: string, signal: AbortSignal) => Promise<T>,
  version = 0,
): Part<T> {
  const [state, setState] = useState<{ token: string; part: Part<T> }>();
  const token = `${key ?? ''}#${version}`;
  const [reader] = useState(() => read);
  useEffect(() => {
    if (!api || !key) return;
    const controller = new AbortController();
    reader(api, key, controller.signal).then(
      (value) =>
        !controller.signal.aborted && setState({ token, part: { status: 'ready', value } }),
      (error: unknown) =>
        !controller.signal.aborted &&
        setState({ token, part: { status: 'error', message: messageOf(error) } }),
    );
    return () => controller.abort();
  }, [api, key, token, reader]);
  return state?.token === token ? state.part : LOADING;
}
