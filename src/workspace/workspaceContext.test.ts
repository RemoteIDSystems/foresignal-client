import { INITIAL_STATE } from '../state/store';
import {
  appContext,
  closedPanelsFrom,
  contextPatch,
  decodeLink,
  fragmentPayload,
  isEmptyPatch,
  layoutOf,
  linkUrl,
  mergePatch,
  restoreFrom,
  type BoundState,
} from './workspaceContext';

const quake = {
  id: { layer: 'earthquake', kind: 'earthquake', source: 'usgs-earthquakes', externalId: 'nc1' },
  title: 'M 2.5',
  type: 'point' as const,
  longitude: -122.8,
  latitude: 38.8,
  distance: 0,
};

const state = (patch: Partial<BoundState> = {}): BoundState => ({
  selection: INITIAL_STATE.selection,
  viewport: INITIAL_STATE.viewport,
  layers: INITIAL_STATE.layers,
  time: INITIAL_STATE.time,
  ...patch,
});

/** A deep link's payload, encoded as the backend encodes it: base64url JSON, unpadded. */
function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('the workspace context', () => {
  it('is what the app shows, over the workspace’s own selected refs and filters', () => {
    const context = appContext(
      state({
        selection: quake,
        viewport: { bbox: [-123.2, 38.4, -122.4, 39], zoom: 8 },
        layers: {
          kinds: ['earthquake', 'wildfire'],
          products: ['goes-east'],
          hiddenSources: ['x'],
        },
        time: { mode: 'asOf', asOf: '2026-10-18T12:00:00Z' },
      }),
      { selectedRefs: ['facility:1'], filters: { region: 'US-CA' } },
    );
    expect(context).toEqual({
      selectedRefs: ['facility:1'],
      focusRef: 'record:usgs-earthquakes/nc1',
      viewport: { bbox: [-123.2, 38.4, -122.4, 39] },
      layers: ['earthquake', 'wildfire', 'product:goes-east'],
      filters: { region: 'US-CA', hiddenSources: ['x'] },
      asOf: '2026-10-18T12:00:00Z',
    });
  });

  it('leaves the layers alone while the user has not chosen any, and clears focus and time', () => {
    const context = appContext(state(), { layers: ['earthquake'], focusRef: 'facility:1' });
    expect(context.layers).toEqual(['earthquake']);
    expect(context.focusRef).toBeNull();
    expect(context.asOf).toBeNull();
    expect(context).not.toHaveProperty('viewport');
  });

  it('patches only the fields that changed, with null for one that is gone', () => {
    const from = { focusRef: 'a:1', layers: ['x'], asOf: '2026-10-18T00:00:00Z' };
    expect(contextPatch(from, { ...from })).toEqual({});
    expect(isEmptyPatch(contextPatch(from, { ...from }))).toBe(true);
    expect(contextPatch(from, { focusRef: 'a:2', layers: ['x'] })).toEqual({
      focusRef: 'a:2',
      asOf: null,
    });
    // An absent field and a null one are the same.
    expect(contextPatch({ focusRef: null }, {})).toEqual({});
  });

  it('applies a JSON merge patch as RFC 7396 says', () => {
    const target = { a: 1, b: { c: 2, d: 3 }, list: [1, 2] };
    expect(mergePatch(target, { a: null, b: { c: 5 }, list: [3], e: 'new' })).toEqual({
      b: { c: 5, d: 3 },
      list: [3],
      e: 'new',
    });
    expect(target).toEqual({ a: 1, b: { c: 2, d: 3 }, list: [1, 2] });
    expect(mergePatch(target, ['whole'])).toEqual(['whole']);
  });

  it('restores layers, hidden sources, the time, the map’s place and the focus', () => {
    const restore = restoreFrom({
      layers: ['wildfire', 'product:goes-east', 'earthquake'],
      filters: { hiddenSources: ['b', 'a', 3] },
      asOf: '2026-10-18T12:00:00Z',
      viewport: { bbox: [-123.2, 38.4, -122.4, 39] },
      focusRef: 'record:usgs-earthquakes/nc1',
    });
    expect(restore.layers).toEqual({
      kinds: ['earthquake', 'wildfire'],
      products: ['goes-east'],
      hiddenSources: ['a', 'b'],
    });
    expect(restore.time).toEqual({ mode: 'asOf', asOf: '2026-10-18T12:00:00Z' });
    expect(restore.locate?.longitude).toBeCloseTo(-122.8);
    expect(restore.locate?.latitude).toBeCloseTo(38.7);
    expect(restore.locate?.height).toBeGreaterThan(60_000);
    expect(restore.locate?.height).toBeLessThan(90_000);
    expect(restore.focusRef).toBe('record:usgs-earthquakes/nc1');
  });

  it('centers a box across the antimeridian, and a center with a radius', () => {
    expect(restoreFrom({ viewport: { bbox: [170, -20, -170, 0] } }).locate?.longitude).toBeCloseTo(
      180,
    );
    const around = restoreFrom({ viewport: { center: [10, 50], radiusKm: 50 } });
    expect(around.locate).toMatchObject({ longitude: 10, latitude: 50 });
    expect(around.locate?.height).toBe(120_000);
    // A context without a time is live; without layers, the layers stay as they are.
    expect(restoreFrom({})).toEqual({ time: { mode: 'live' } });
  });

  it('reads a deep link’s fragment as the backend encodes it', () => {
    const ctx = { focusRef: 'place:Zürich', layers: ['earthquake'] };
    const payload = encode({ v: 1, ws: null, ctx });
    expect(fragmentPayload(`#fs=${payload}`)).toBe(payload);
    expect(fragmentPayload(`#tab=1&fs=${payload}`)).toBe(payload);
    expect(fragmentPayload('#other')).toBeUndefined();
    expect(decodeLink(payload)).toEqual({ v: 1, ctx });
    expect(decodeLink(encode({ v: 1, ws: '01J', ctx }))).toEqual({ v: 1, ws: '01J', ctx });
    expect(decodeLink(encode({ v: 2, ctx }))).toBeUndefined();
    expect(decodeLink('not-json')).toBeUndefined();
  });

  it('makes a link from this page and the fragment', () => {
    const here = { origin: 'https://fs.test', pathname: '/global', search: '?x=1' };
    expect(linkUrl(here, '#fs=abc')).toBe('https://fs.test/global?x=1#fs=abc');
    expect(linkUrl(here, 'fs=abc')).toBe('https://fs.test/global?x=1#fs=abc');
  });

  it('keeps the closed panels as the layout, and reads only its own layout back', () => {
    expect(layoutOf(['timeline', 'insights'])).toEqual({
      v: 1,
      closedPanels: ['insights', 'timeline'],
    });
    expect(closedPanelsFrom({ v: 1, closedPanels: ['b', 'a', 1] })).toEqual(['a', 'b']);
    expect(closedPanelsFrom({ panels: [] })).toEqual([]);
    expect(closedPanelsFrom(undefined)).toEqual([]);
  });
});
