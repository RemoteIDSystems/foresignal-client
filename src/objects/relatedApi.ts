import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** An object's related objects, flat (`RelatedObjects`). */
export type RelatedObjects = components['schemas']['RelatedObjects'];

/** The most related objects one read asks for (the backend's own maximum). */
export const RELATED_LIMIT = 500;

/**
 * An object's related objects through the relation graph (`listRelatedObjects`), as known now or,
 * with `asOf`, at that instant: up to {@link RELATED_LIMIT}, in both directions.
 */
export function listRelatedObjects(
  api: ForesignalClient,
  ref: string,
  asOf?: string,
  signal?: AbortSignal,
): Promise<RelatedObjects> {
  return unwrap(
    api.GET('/v1/objects/{ref}/related', {
      params: {
        path: { ref },
        query: { limit: RELATED_LIMIT, direction: 'both', ...(asOf !== undefined && { asOf }) },
      },
      signal,
    }),
  );
}

/** The full related list as a panel shows it: not asked for, loading, loaded, or failed. */
export type RelatedListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; related: RelatedObjects }
  | { status: 'error'; message: string };

/**
 * The full related list of an object, read only while `wanted` (the dossier's own lists were cut
 * short); otherwise idle, and no request is made.
 */
export function useRelatedObjects(
  api: ForesignalClient | undefined,
  ref: string | undefined,
  asOf: string | undefined,
  wanted: boolean,
): RelatedListState {
  const key = wanted && ref !== undefined ? `${ref}|${asOf ?? ''}` : undefined;
  const [state, setState] = useState<{ key?: string; value: RelatedListState }>({
    value: { status: 'idle' },
  });
  useEffect(() => {
    if (!api || ref === undefined || key === undefined) return;
    const controller = new AbortController();
    listRelatedObjects(api, ref, asOf, controller.signal).then(
      (related) => {
        if (!controller.signal.aborted) setState({ key, value: { status: 'ready', related } });
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          cause instanceof Error ? cause.message : 'The related objects did not load.';
        setState({ key, value: { status: 'error', message } });
      },
    );
    return () => controller.abort();
  }, [api, ref, asOf, key]);
  if (key === undefined || !api) return { status: 'idle' };
  return state.key === key ? state.value : { status: 'loading' };
}
