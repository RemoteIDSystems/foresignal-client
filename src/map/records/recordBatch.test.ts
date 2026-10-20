// @vitest-environment node
import type { GeometryInstance } from 'cesium';
import { MERGE_MS, MergedPrimitive, type PrimitiveHost } from './recordBatch';

/** A primitive the test marks ready, recording the instances it was built from. */
class FakePrimitive {
  ready = false;
  constructor(readonly instances: GeometryInstance[]) {}
}

/** A host that records what is in the scene, and a frame hook the test fires. */
function harness() {
  const scene = new Set<FakePrimitive>();
  const host: PrimitiveHost = {
    add: (p) => {
      scene.add(p as FakePrimitive);
      return p;
    },
    remove: (p) => scene.delete(p as FakePrimitive),
  };
  const frames = new Set<() => void>();
  const onFrame = (callback: () => void) => {
    frames.add(callback);
    return () => frames.delete(callback);
  };
  const merged = new MergedPrimitive(host, (i) => new FakePrimitive(i), onFrame);
  const frame = () => [...frames].forEach((callback) => callback());
  /** Marks every primitive in the scene ready and renders a frame. */
  const ready = () => {
    for (const p of scene) p.ready = true;
    frame();
  };
  return { scene, merged, frame, ready };
}

/** Stand-in instances: the merge only counts and passes them on. */
const instances = (n: number) => Array.from({ length: n }, () => ({}) as GeometryInstance);

describe('MergedPrimitive', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('builds one primitive for a burst of owners, after the merge delay', () => {
    const { scene, merged, ready } = harness();
    merged.set('a|1/0/0', instances(2));
    merged.set('b|1/0/0', instances(3));
    expect(scene.size).toBe(0);
    vi.advanceTimersByTime(MERGE_MS);
    expect(scene.size).toBe(1);
    expect([...scene][0]!.instances).toHaveLength(5);
    expect(merged.builds).toBe(1);
    expect(merged.pending).toBe(true);
    ready();
    expect(merged.pending).toBe(false);
    expect(merged.instanceCount).toBe(5);
  });

  it('keeps the drawn primitive until its replacement is ready, and waits for a build in flight', () => {
    const { scene, merged, frame, ready } = harness();
    merged.set('a', instances(1));
    vi.advanceTimersByTime(MERGE_MS);
    ready();
    const first = [...scene][0]!;

    merged.set('b', instances(1));
    vi.advanceTimersByTime(MERGE_MS);
    expect(scene.size).toBe(2);
    // A change while the second build is in flight waits for it.
    merged.set('c', instances(1));
    vi.advanceTimersByTime(MERGE_MS * 5);
    expect(merged.builds).toBe(2);
    frame();
    expect(scene.has(first)).toBe(true);
    ready();
    expect(scene.has(first)).toBe(false);
    expect(scene.size).toBe(1);
    // Then the waiting change is built.
    vi.advanceTimersByTime(MERGE_MS);
    expect(merged.builds).toBe(3);
    ready();
    expect([...scene][0]!.instances).toHaveLength(3);
  });

  it('removes a layer’s owners together and clears the scene when nothing is left', () => {
    const { scene, merged, ready } = harness();
    merged.set('a|1/0/0', instances(1));
    merged.set('a|1/1/0', instances(1));
    merged.set('ab|1/0/0', instances(1));
    vi.advanceTimersByTime(MERGE_MS);
    ready();
    merged.deletePrefix('a|');
    expect(merged.instanceCount).toBe(1);
    vi.advanceTimersByTime(MERGE_MS);
    ready();
    expect([...scene][0]!.instances).toHaveLength(1);
    merged.set('ab|1/0/0', []);
    vi.advanceTimersByTime(MERGE_MS);
    expect(scene.size).toBe(0);
    expect(merged.builds).toBe(2);
  });

  it('removes everything on destroy and builds nothing after', () => {
    const { scene, merged, ready } = harness();
    merged.set('a', instances(1));
    vi.advanceTimersByTime(MERGE_MS);
    ready();
    merged.set('b', instances(1));
    vi.advanceTimersByTime(MERGE_MS);
    merged.destroy();
    expect(scene.size).toBe(0);
    merged.set('c', instances(1));
    vi.advanceTimersByTime(MERGE_MS * 2);
    expect(scene.size).toBe(0);
  });
});
