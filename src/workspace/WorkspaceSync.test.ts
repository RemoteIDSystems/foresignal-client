import { FsError } from '../api/errors';
import { json, standInApi, type Answer } from '../intel/testing/standIn';
import { createStore, INITIAL_STATE, type AppState } from '../state/store';
import { quakeDossier, workspace, WORKSPACE_ID } from './testing/workspaceFixtures';
import { isStale, MAX_SELECTED_REFS, WorkspaceSync } from './WorkspaceSync';
import type { WorkspaceContext } from './workspaceApi';

const base = `/v1/workspaces/${WORKSPACE_ID}`;
const dossier = `/v1/objects/${encodeURIComponent('record:usgs-earthquakes/nc1')}/dossier`;
const stale = () =>
  json(
    {
      title: 'Precondition Failed',
      status: 412,
      code: 'WORKSPACE_CONTEXT_STALE',
      detail: 'Stale.',
    },
    412,
  );
const contextState = (version: number, context: WorkspaceContext) => () =>
  json({ workspaceId: WORKSPACE_ID, contextVersion: version, context });

/** A binding over a stand-in backend and a fresh store, sending at once when asked to flush. */
function setUp(answers: Record<string, Answer>, now = () => Date.now()) {
  const stand = standInApi({
    [`GET ${base}`]: () => json(workspace),
    [`GET ${dossier}`]: () => json(quakeDossier),
    ...answers,
  });
  const store = createStore<AppState>(INITIAL_STATE);
  const sync = new WorkspaceSync(stand.api, store, { debounceMs: 0, now });
  const stop = sync.start();
  return { ...stand, store, sync, stop };
}

const patches = (asked: string[]) => asked.filter((line) => line === `PATCH ${base}/context`);
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('the workspace binding', () => {
  it('opens a workspace: binds to it, and shows its layers, time, place, focus and layout', async () => {
    const { store, sync, asked } = setUp({});
    await sync.open(WORKSPACE_ID);
    expect(store.get('workspace')).toMatchObject({
      id: WORKSPACE_ID,
      name: 'Geysers swarm',
      role: 'owner',
      contextVersion: 3,
    });
    expect(store.get('workspaceContextVersion')).toBe(1);
    expect(store.get('layers')).toEqual({
      kinds: ['earthquake'],
      products: ['goes-east'],
      hiddenSources: ['emsc'],
    });
    expect(store.get('time')).toEqual({ mode: 'asOf', asOf: '2026-10-18T12:00:00Z' });
    expect(store.get('locate')).toMatchObject({ longitude: -122.8 });
    expect(store.get('selection')?.title).toBe('M 2.5 - The Geysers');
    expect(store.get('closedPanels')).toEqual(['insights']);
    // What it shows is the context: nothing is sent back.
    await sync.flush();
    await tick();
    expect(patches(asked)).toHaveLength(0);
  });

  it('sends a change as a merge patch of what changed, on the version it last saw', async () => {
    const { store, sync, asked, bodies } = setUp({
      [`PATCH ${base}/context`]: contextState(4, { ...workspace.context, asOf: null }),
    });
    await sync.open(WORKSPACE_ID);
    store.set('time', { mode: 'live' });
    await sync.flush();
    expect(patches(asked)).toHaveLength(1);
    expect(bodies[asked.indexOf(`PATCH ${base}/context`)]).toEqual({ asOf: null });
    expect(store.get('workspace')?.contextVersion).toBe(4);
    expect(store.get('workspaceContextVersion')).toBe(2);
  });

  it('sends a change once it rests', async () => {
    const { store, sync, asked } = setUp({
      [`PATCH ${base}/context`]: contextState(4, { ...workspace.context, asOf: null }),
    });
    await sync.open(WORKSPACE_ID);
    store.set('time', { mode: 'live' });
    await vi.waitFor(() => expect(patches(asked)).toHaveLength(1));
  });

  it('re-reads a stale context, sends the same change on the new version, and shows the others’', async () => {
    let reads = 0;
    let calls = 0;
    const ifMatch: (string | null)[] = [];
    const moved = {
      ...workspace,
      contextVersion: 7,
      context: { ...workspace.context, layers: ['wildfire'] },
    };
    const { store, sync, asked, bodies } = setUp({
      [`GET ${base}`]: () => json(reads++ === 0 ? workspace : moved),
      [`PATCH ${base}/context`]: (request) => {
        ifMatch.push(request.headers.get('If-Match'));
        calls += 1;
        return calls === 1 ? stale() : contextState(8, { ...moved.context, asOf: null })();
      },
    });
    await sync.open(WORKSPACE_ID);
    store.set('time', { mode: 'live' });
    expect(await sync.flush()).toBe(true);
    expect(ifMatch).toEqual(['3', '7']);
    const sent = bodies.filter((_, i) => asked[i] === `PATCH ${base}/context`);
    expect(sent).toEqual([{ asOf: null }, { asOf: null }]);
    expect(store.get('workspace')?.contextVersion).toBe(8);
    // Another client's layers are shown here; this client's own change is kept.
    expect(store.get('layers').kinds).toEqual(['wildfire']);
    expect(store.get('time')).toEqual({ mode: 'live' });
    // Nothing is left to send.
    await sync.flush();
    expect(patches(asked)).toHaveLength(2);
  });

  it('gives up after three stale answers and says the change was not saved', async () => {
    const { store, sync, asked } = setUp({ [`PATCH ${base}/context`]: stale });
    await sync.open(WORKSPACE_ID);
    store.set('time', { mode: 'live' });
    expect(await sync.flush()).toBe(false);
    expect(patches(asked)).toHaveLength(3);
    expect(store.get('workspace')?.error).toContain('Stale.');
  });

  it('adds an object to the selected refs, keeping another client’s additions on a stale version', async () => {
    let reads = 0;
    let calls = 0;
    const theirs = {
      ...workspace.context,
      selectedRefs: [...(workspace.context.selectedRefs ?? []), 'place:2'],
    };
    const { sync, asked, bodies } = setUp({
      [`GET ${base}`]: () =>
        json(reads++ === 0 ? workspace : { ...workspace, contextVersion: 4, context: theirs }),
      [`PATCH ${base}/context`]: () => {
        calls += 1;
        return calls === 1 ? stale() : contextState(5, theirs)();
      },
    });
    await sync.open(WORKSPACE_ID);
    expect(await sync.addRef('report:1')).toBe(true);
    const sent = bodies.filter((_, i) => asked[i] === `PATCH ${base}/context`);
    expect(sent).toEqual([
      { selectedRefs: ['facility:01JA8Q00000000000000000G01', 'report:1'] },
      { selectedRefs: ['facility:01JA8Q00000000000000000G01', 'place:2', 'report:1'] },
    ]);
  });

  it('keeps the last 200 selected refs, sends nothing for one already there, and needs a workspace', async () => {
    const { sync, store, asked, bodies } = setUp({
      [`PATCH ${base}/context`]: contextState(4, workspace.context),
    });
    await expect(sync.addRef('report:1')).rejects.toThrow('Open a workspace first.');
    await sync.open(WORKSPACE_ID);
    const full = Array.from({ length: MAX_SELECTED_REFS }, (_, i) => `facility:${i}`);
    const active = store.get('workspace');
    if (!active) throw new Error('not bound');
    store.set('workspace', { ...active, context: { ...active.context, selectedRefs: full } });
    expect(await sync.addRef('facility:3')).toBe(true);
    expect(patches(asked)).toHaveLength(0);
    expect(await sync.addRef('report:9')).toBe(true);
    const sent = bodies[asked.indexOf(`PATCH ${base}/context`)] as { selectedRefs: string[] };
    expect(sent.selectedRefs).toHaveLength(MAX_SELECTED_REFS);
    expect(sent.selectedRefs[0]).toBe('facility:1');
    expect(sent.selectedRefs.at(-1)).toBe('report:9');
  });

  it('takes the map’s first view after a restore as the context’s, and sends later moves', async () => {
    let now = 1_000;
    const { store, sync, asked, bodies } = setUp(
      { [`PATCH ${base}/context`]: contextState(4, workspace.context) },
      () => now,
    );
    await sync.open(WORKSPACE_ID);
    store.set('viewport', { bbox: [-123.3, 38.3, -122.3, 39.1], zoom: 8 });
    await tick();
    expect(patches(asked)).toHaveLength(0);
    expect(store.get('workspace')?.context.viewport).toEqual({
      bbox: [-123.3, 38.3, -122.3, 39.1],
    });
    now += 10_000;
    store.set('viewport', { bbox: [10, 45, 12, 47], zoom: 7 });
    await vi.waitFor(() => expect(patches(asked)).toHaveLength(1));
    expect(bodies[asked.indexOf(`PATCH ${base}/context`)]).toEqual({
      viewport: { bbox: [10, 45, 12, 47] },
    });
  });

  it('stores the layout when a panel is closed', async () => {
    const { store, sync, asked, bodies } = setUp({ [`PUT ${base}/layout`]: () => json(workspace) });
    await sync.open(WORKSPACE_ID);
    store.set('closedPanels', ['insights', 'timeline']);
    await vi.waitFor(() => expect(asked).toContain(`PUT ${base}/layout`));
    expect(bodies[asked.indexOf(`PUT ${base}/layout`)]).toEqual({
      v: 1,
      closedPanels: ['insights', 'timeline'],
    });
  });

  it('creates a workspace from what the app shows, and leaves it', async () => {
    const { store, sync, asked, bodies } = setUp({
      'POST /v1/workspaces': () => json({ ...workspace, contextVersion: 1 }, 201),
    });
    store.set('layers', { kinds: ['wildfire'], hiddenSources: [] });
    await sync.create('Fires');
    expect(bodies[asked.indexOf('POST /v1/workspaces')]).toMatchObject({
      name: 'Fires',
      private: false,
      context: { layers: ['wildfire'], focusRef: null, asOf: null },
    });
    expect(store.get('workspace')?.contextVersion).toBe(1);
    sync.leave();
    expect(store.get('workspace')).toBeUndefined();
  });

  it('restores a deep link without joining its workspace', async () => {
    const { store, sync, asked } = setUp({});
    const payload = btoa(
      JSON.stringify({ v: 1, ws: WORKSPACE_ID, ctx: { layers: ['earthquake'], asOf: null } }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await sync.restoreLink(`#fs=${payload}`)).toBe(true);
    expect(store.get('layers')).toEqual({ kinds: ['earthquake'], products: [], hiddenSources: [] });
    expect(store.get('workspace')).toBeUndefined();
    expect(sync.linkedWorkspaceId).toBe(WORKSPACE_ID);
    expect(asked).toEqual([]);
    expect(await sync.restoreLink('#nothing')).toBe(false);
  });

  it('knows the backend’s stale answer', () => {
    expect(
      isStale(new FsError({ status: 412, code: 'WORKSPACE_CONTEXT_STALE', title: 'Stale' })),
    ).toBe(true);
    expect(isStale(new FsError({ status: 409, title: 'Conflict' }))).toBe(false);
    expect(isStale(new Error('x'))).toBe(false);
  });
});
