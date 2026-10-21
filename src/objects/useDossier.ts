import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { dossiersFor, type Dossier } from './objectApi';

/**
 * The one value a read returns while loading, so it is the same object on every render (an
 * effect or memo that lists the result does not run again for nothing).
 */
const LOADING = { status: 'loading' } as const;

/** The one value returned with nothing to read. */
const IDLE = { status: 'idle' } as const;

/** A dossier as the panel shows it: loading, loaded, or why it did not load. */
export type DossierState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; dossier: Dossier }
  | { status: 'error'; message: string };

/**
 * The dossier of an object (`getObjectDossier`), read when the ref or the instant changes, and read
 * again (revalidated by ETag) whenever `refresh` changes, such as when the live stream says the
 * object's kind changed. A re-read keeps the dossier shown until the new one arrives.
 */
export function useDossier(
  api: ForesignalClient | undefined,
  ref: string | undefined,
  asOf: string | undefined,
  refresh: unknown,
): DossierState {
  const [state, setState] = useState<{ key?: string; value: DossierState }>({
    value: { status: 'idle' },
  });
  const key = ref === undefined ? undefined : `${ref}|${asOf ?? ''}`;

  useEffect(() => {
    if (!api || ref === undefined) return;
    const controller = new AbortController();
    dossiersFor(api)
      .load(ref, asOf, controller.signal)
      .then((dossier) => {
        if (!controller.signal.aborted) {
          setState({ key, value: { status: 'ready', dossier } });
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const message = cause instanceof Error ? cause.message : 'The dossier did not load.';
        setState({ key, value: { status: 'error', message } });
      });
    return () => controller.abort();
  }, [api, ref, asOf, key, refresh]);

  if (!api || ref === undefined || state.key !== key) {
    return ref === undefined || !api ? IDLE : LOADING;
  }
  return state.value;
}
