import type { ChangeStream } from '../api/stream/ChangeStream';
import type { AppState, LayerLive, Store } from './store';

/** A kind's live state before anything arrived. */
const EMPTY: LayerLive = { changes: 0, live: 0, resyncs: 0 };

/**
 * Applies the live stream to the store as per-key deltas: each change or live update bumps its
 * kind's `layer:<kind>` key (the changes of one delivery together, in one notification per key),
 * and a resync bumps every kind's. Only components subscribed to a changed kind re-render. Returns
 * a function that stops it.
 */
export function connectStreamToStore(
  stream: Pick<ChangeStream, 'listen'>,
  store: Store<AppState>,
  now: () => number = Date.now,
): () => void {
  const bump = (kind: string, patch: (current: LayerLive) => Partial<LayerLive>) => {
    const key = `layer:${kind}` as const;
    const current = store.get(key) ?? EMPTY;
    store.set(key, { ...current, ...patch(current), at: now() });
  };
  return stream.listen({
    changes(changes) {
      store.batch(() => {
        for (const change of changes) {
          bump(change.kind, (current) => ({
            changes: current.changes + 1,
            lastSeq: Math.max(current.lastSeq ?? 0, change.seq),
          }));
        }
      });
    },
    live(event) {
      bump(event.kind, (current) => ({ live: current.live + 1 }));
    },
    resync() {
      store.batch(() => {
        for (const key of store.keys()) {
          if (typeof key === 'string' && key.startsWith('layer:')) {
            bump(key.slice('layer:'.length), (current) => ({ resyncs: current.resyncs + 1 }));
          }
        }
      });
    },
  });
}
