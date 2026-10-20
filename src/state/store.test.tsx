import { act, render } from '@testing-library/react';
import type { Change, StreamListener } from '../api/stream/ChangeStream';
import { connectStreamToStore } from './liveDeltas';
import {
  createStore,
  INITIAL_STATE,
  reconcile,
  useStoreKey,
  useStoreKeys,
  type AppState,
  type Store,
} from './store';

describe('reconcile', () => {
  it('keeps the value held when the new one is equal in content', () => {
    const held = { bbox: [1, 2, 3, 4], zoom: 3 };
    expect(reconcile(held, { bbox: [1, 2, 3, 4], zoom: 3 })).toBe(held);
  });

  it('keeps the identity of the parts that did not change', () => {
    const held = { kinds: ['a', 'b'], hiddenSources: ['x'] };
    const next = reconcile(held, { kinds: ['a', 'b', 'c'], hiddenSources: ['x'] });
    expect(next).not.toBe(held);
    expect(next.hiddenSources).toBe(held.hiddenSources);
    expect(next.kinds).toEqual(['a', 'b', 'c']);
  });

  it('sees an added or removed field, and compares class instances by identity', () => {
    expect(reconcile({ a: 1 }, { a: 1, b: undefined })).toEqual({ a: 1, b: undefined });
    expect(reconcile({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
    const date = new Date(0);
    expect(reconcile(new Date(0), date)).toBe(date);
  });
});

describe('createStore', () => {
  it('tells only the listeners of the key that changed, and nobody for an equal value', () => {
    const store = createStore<AppState>(INITIAL_STATE);
    const viewport = vi.fn();
    const layers = vi.fn();
    store.subscribe('viewport', viewport);
    store.subscribe('layers', layers);
    store.set('viewport', { bbox: [0, 0, 10, 10], zoom: 4 });
    store.set('viewport', { bbox: [0, 0, 10, 10], zoom: 4 });
    expect(viewport).toHaveBeenCalledTimes(1);
    expect(layers).not.toHaveBeenCalled();
    store.merge('layers', { kinds: ['earthquake'] });
    store.merge('layers', { kinds: ['earthquake'] });
    expect(layers).toHaveBeenCalledTimes(1);
    expect(store.get('layers')).toEqual({ hiddenSources: [], kinds: ['earthquake'] });
  });

  it('tells each key once for a batch of writes', () => {
    const store = createStore<AppState>(INITIAL_STATE);
    const listener = vi.fn();
    store.subscribe('layer:earthquake', listener);
    store.batch(() => {
      for (let i = 0; i < 5; i++) {
        store.update('layer:earthquake', (current) => ({
          changes: (current?.changes ?? 0) + 1,
          live: 0,
          resyncs: 0,
        }));
      }
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get('layer:earthquake')?.changes).toBe(5);
  });

  it('stops telling a listener once it unsubscribes', () => {
    const store = createStore<AppState>(INITIAL_STATE);
    const listener = vi.fn();
    const stop = store.subscribe('time', listener);
    stop();
    store.set('time', { mode: 'asOf', asOf: '2026-10-20T00:00:00Z' });
    expect(listener).not.toHaveBeenCalled();
  });
});

/** A stand-in live stream the test pushes events through. */
function fakeStream() {
  const listeners = new Set<StreamListener>();
  return {
    listen(listener: StreamListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    changes(changes: Change[]) {
      for (const listener of listeners) listener.changes?.(changes, 'stream');
    },
    resync() {
      for (const listener of listeners) listener.resync?.('gap');
    },
  };
}

function change(seq: number, kind: string): Change {
  return {
    seq,
    kind,
    source: 'usgs-earthquakes',
    externalId: `q${seq}`,
    version: 1,
    observedAt: '2026-10-20T12:00:00Z',
    tombstone: false,
    leftFilter: false,
  };
}

describe('the store in components (render counts)', () => {
  /** Mounts one component per key and counts each one's renders. */
  function mount(store: Store<AppState>) {
    const renders = { layers: 0, viewport: 0, sceneMode: 0, quakes: 0, vessels: 0, both: 0 };
    function Layers() {
      useStoreKey('layers', store);
      renders.layers++;
      return null;
    }
    function Viewport() {
      useStoreKey('viewport', store);
      renders.viewport++;
      return null;
    }
    function Scene() {
      useStoreKey('sceneMode', store);
      renders.sceneMode++;
      return null;
    }
    function Quakes() {
      useStoreKey('layer:earthquake', store);
      renders.quakes++;
      return null;
    }
    function Vessels() {
      useStoreKey('layer:vessel', store);
      renders.vessels++;
      return null;
    }
    function Both() {
      useStoreKeys(['viewport', 'sceneMode'], store);
      renders.both++;
      return null;
    }
    render(
      <>
        <Layers />
        <Viewport />
        <Scene />
        <Quakes />
        <Vessels />
        <Both />
      </>,
    );
    return renders;
  }

  it('re-renders only the components subscribed to what changed', () => {
    const store = createStore<AppState>(INITIAL_STATE);
    const stream = fakeStream();
    connectStreamToStore(stream, store, () => 1_000);
    const renders = mount(store);
    const initial = { layers: 1, viewport: 1, sceneMode: 1, quakes: 1, vessels: 1, both: 1 };
    expect(renders).toEqual(initial);

    // Toggling a layer.
    act(() => store.merge('layers', { kinds: ['earthquake'] }));
    expect(renders).toEqual({ ...initial, layers: 2 });

    // Moving the camera; then the same view again, which changes nothing.
    act(() => store.set('viewport', { bbox: [-130, 20, -60, 55], zoom: 3.2 }));
    act(() => store.set('viewport', { bbox: [-130, 20, -60, 55], zoom: 3.2 }));
    expect(renders).toEqual({ ...initial, layers: 2, viewport: 2, both: 2 });

    // A stream delta for earthquakes: three changes, one render, and only of the earthquake view.
    act(() =>
      stream.changes([change(1, 'earthquake'), change(2, 'earthquake'), change(3, 'earthquake')]),
    );
    expect(renders).toEqual({ ...initial, layers: 2, viewport: 2, both: 2, quakes: 2 });
    expect(store.get('layer:earthquake')).toEqual({
      changes: 3,
      live: 0,
      resyncs: 0,
      lastSeq: 3,
      at: 1_000,
    });

    // Switching to the globe.
    act(() => store.set('sceneMode', '3d'));
    expect(renders).toEqual({
      ...initial,
      layers: 2,
      viewport: 2,
      both: 3,
      quakes: 2,
      sceneMode: 2,
    });

    // A resync touches every kind the stream has spoken of, here earthquakes only.
    act(() => stream.resync());
    expect(renders.quakes).toBe(3);
    expect(renders.vessels).toBe(1);
    expect(store.get('layer:earthquake')?.resyncs).toBe(1);
  });
});
