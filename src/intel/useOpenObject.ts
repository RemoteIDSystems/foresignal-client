import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { ForesignalClient } from '../api/client';
import { hitForRef } from '../objects/selectObject';
import { locateRequest } from '../search/locate';
import type { AppState, Store } from '../state/store';
import { analysisPath } from './analysisView';

/**
 * Opens an object from an analysis view: a situation or investigation opens its own full-analysis
 * view; anything else is selected on the Global dashboard, with its dossier, and the map asked to
 * move to it (as a search result is, 017).
 */
export function useOpenObject(
  api: ForesignalClient | undefined,
  store: Store<AppState>,
): (ref: string) => Promise<void> {
  const navigate = useNavigate();
  return useCallback(
    async (ref: string) => {
      const path = analysisPath(ref);
      if (path) {
        await navigate(path);
        return;
      }
      if (!api) return;
      await navigate('/global');
      try {
        const hit = await hitForRef(api, ref);
        store.set('selection', hit);
        if (Number.isFinite(hit.longitude)) {
          store.set('locate', locateRequest(hit.longitude, hit.latitude));
        }
      } catch {
        // The dossier did not load; the Global dashboard opens without a selection.
      }
    },
    [api, store, navigate],
  );
}
