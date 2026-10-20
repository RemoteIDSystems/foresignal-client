// @vitest-environment node
import fixture from '../style/fixtures/overlay-style.json';
import { parseOverlayStyle, type MapStyle } from '../style/parseStyle';
import {
  buildCatalog,
  defaultEnabled,
  drawnLayers,
  enabledKinds,
  filterSources,
  shownCount,
  withViewCounts,
  type KindSummary,
  type TileLayerSummary,
} from './catalog';

/** The 006 fixture style: conflict-event from acled, gdelt-events (circle) and ucdp-ged, etc. */
const model = parseOverlayStyle(fixture as unknown as MapStyle);

const layer = (id: string, type: 'kind' | 'source', name = id, agg?: number): TileLayerSummary => ({
  id,
  type,
  name,
  tilejson: `http://localhost:8080/v1/tiles/${id}.json`,
  aggBelowZoom: agg ?? null,
});

const index: TileLayerSummary[] = [
  layer('aircraft', 'kind', 'aircraft', 7),
  layer('aviation-hazard', 'kind'),
  layer('conflict-event', 'kind'),
  layer('aprs-station', 'kind'),
  layer('social-post', 'kind'),
  layer('nws-alert', 'kind'),
  layer('a-new-kind', 'kind'),
  layer('acled', 'source', 'ACLED'),
  layer('gdelt-events', 'source', 'GDELT 2.0 Events'),
  layer('aprs-is', 'source', '  '),
];

const kinds: KindSummary[] = [
  { kind: 'conflict-event', currentCount: 12, sources: ['gdelt-events'] },
  { kind: 'aprs-station', currentCount: 40, sources: ['aprs-is'] },
  { kind: 'aviation-hazard', currentCount: 3, sources: ['awc-gairmets'] },
];

describe('buildCatalog', () => {
  const catalog = buildCatalog(index, kinds, model);

  it('groups kinds into the mock’s categories, in its order, with Other last', () => {
    expect(
      catalog.categories.map((group) => [group.label, group.kinds.map((k) => k.id), group.count]),
    ).toEqual([
      ['Events', ['social-post'], 0],
      // Most records first, then by label.
      ['Aircraft (ADS-B)', ['aviation-hazard', 'aircraft'], 3],
      ['Weather', ['nws-alert'], 0],
      ['RF / Spectrum', ['aprs-station'], 40],
      ['Conflicts / Security', ['conflict-event'], 12],
      ['Other', ['a-new-kind'], 0],
    ]);
  });

  it('labels kinds with the prettifier and counts them from listKinds', () => {
    expect(catalog.kinds.find((e) => e.id === 'aprs-station')).toMatchObject({
      label: 'APRS Station',
      category: 'rf',
      sources: ['aprs-is'],
      count: 40,
    });
    expect(catalog.kinds.find((e) => e.id === 'aircraft')).toMatchObject({
      count: 0,
      sources: [],
      aggBelowZoom: 7,
    });
  });

  it('takes a kind’s icon from a source that supplies it now, as the map draws it', () => {
    const conflict = catalog.kinds.find((e) => e.id === 'conflict-event');
    expect(conflict?.swatch?.layerId).toBe('gdelt-events');
    expect(conflict?.swatch?.point?.type).toBe('circle');
    // No current source: the kind's first style stands for it.
    expect(catalog.kinds.find((e) => e.id === 'aircraft')?.swatch?.layerId).toBe('adsbfi-mil');
  });

  it('keeps the source layers for the filter, named by the backend', () => {
    expect(catalog.sources.map((e) => [e.id, e.label, e.kinds, e.count])).toEqual([
      // conflict-event comes from another source now, so acled's own share cannot be told.
      ['acled', 'ACLED', ['conflict-event'], undefined],
      ['gdelt-events', 'GDELT 2.0 Events', ['conflict-event'], 12],
      // aprs-is is the only source of aprs-station (40) and of aprs-message (none now).
      ['aprs-is', 'APRS Is', ['aprs-station', 'aprs-message'], 40],
    ]);
  });

  it('builds without a style: no icons, no source kinds', () => {
    const bare = buildCatalog(index, kinds, undefined);
    expect(bare.kinds.every((e) => e.swatch === undefined)).toBe(true);
    expect(bare.sources.every((e) => e.kinds.length === 0 && e.count === undefined)).toBe(true);
  });
});

describe('defaultEnabled', () => {
  it('turns on the kinds of the categories the mock shows checked, records or not', () => {
    expect(defaultEnabled(buildCatalog(index, kinds, model))).toEqual(['social-post', 'nws-alert']);
  });
});

describe('drawnLayers', () => {
  it('draws only the enabled kinds that have records now', () => {
    const catalog = buildCatalog(index, kinds, model);
    expect(drawnLayers(catalog, new Set(['conflict-event', 'aircraft', 'social-post']))).toEqual([
      'conflict-event',
    ]);
  });
});

describe('enabledKinds', () => {
  const catalog = buildCatalog(index, kinds, model);

  it('scopes each drawn kind to the sources supplying it now', () => {
    const scope = enabledKinds(catalog, new Set(['conflict-event', 'aprs-station', 'aircraft']));
    expect([...scope].map(([kind, sources]) => [kind, [...sources]])).toEqual([
      ['conflict-event', ['gdelt-events']],
      ['aprs-station', ['aprs-is']],
    ]);
  });

  it('drops a kind whose every source the filter hides', () => {
    const scope = enabledKinds(
      catalog,
      new Set(['conflict-event', 'aprs-station']),
      new Set(['gdelt-events']),
    );
    expect([...scope.keys()]).toEqual(['aprs-station']);
  });

  it('is empty when nothing is on', () => {
    expect(enabledKinds(catalog, new Set()).size).toBe(0);
  });
});

describe('filterSources', () => {
  const catalog = buildCatalog(index, kinds, model);

  it('offers the sources of the enabled kinds, the ones with records now first', () => {
    expect(filterSources(catalog, new Set(['conflict-event'])).map((s) => [s.id, s.live])).toEqual([
      ['gdelt-events', true],
      ['acled', false],
    ]);
    expect(filterSources(catalog, new Set(['social-post']))).toEqual([]);
  });
});

describe('withViewCounts', () => {
  const catalog = buildCatalog(index, kinds, model);

  it('sets each kind’s and category’s records in view, keeping the order', () => {
    const inView = withViewCounts(catalog, new Map([['aprs-station', 7]]));
    const rf = inView.categories.find((group) => group.id === 'rf');
    expect(rf?.viewCount).toBe(7);
    expect(inView.kinds.find((e) => e.id === 'conflict-event')?.viewCount).toBe(0);
    expect(inView.categories.map((group) => group.id)).toEqual(
      catalog.categories.map((group) => group.id),
    );
    expect(shownCount(rf!)).toBe(7);
  });

  it('leaves the catalog as it is without counts', () => {
    expect(withViewCounts(catalog, undefined)).toBe(catalog);
    expect(shownCount(catalog.categories[0]!)).toBe(catalog.categories[0]!.count);
  });
});
