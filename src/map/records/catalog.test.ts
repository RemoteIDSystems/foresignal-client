// @vitest-environment node
import fixture from '../style/fixtures/overlay-style.json';
import { parseOverlayStyle, type MapStyle } from '../style/parseStyle';
import {
  buildCatalog,
  defaultEnabled,
  enabledKinds,
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
  layer('conflict-event', 'kind'),
  layer('aprs-station', 'kind'),
  layer('acled', 'source', 'ACLED'),
  layer('gdelt-events', 'source', 'GDELT 2.0 Events'),
  layer('aprs-is', 'source', '  '),
];

const kinds: KindSummary[] = [
  { kind: 'conflict-event', currentCount: 12, sources: ['gdelt-events'] },
  { kind: 'aprs-station', currentCount: 40, sources: ['aprs-is'] },
];

describe('buildCatalog', () => {
  const catalog = buildCatalog(index, kinds, model);

  it('labels kinds with the prettifier and sources with their name, sorted by count', () => {
    expect(catalog.kinds.map((e) => [e.id, e.label, e.count])).toEqual([
      ['aprs-station', 'APRS Station', 40],
      ['conflict-event', 'Conflict Event', 12],
      ['aircraft', 'Aircraft', 0],
    ]);
    expect(catalog.sources.map((e) => [e.id, e.label, e.count])).toEqual([
      // aprs-is is the only source of aprs-station (40) and of aprs-message (absent: none now).
      ['aprs-is', 'APRS Is', 40],
      ['gdelt-events', 'GDELT 2.0 Events', 12],
      // conflict-event comes from another source now, so acled's own share cannot be told.
      ['acled', 'ACLED', undefined],
    ]);
  });

  it('takes a kind’s icon from a source that supplies it now, as the map draws it', () => {
    const conflict = catalog.kinds.find((e) => e.id === 'conflict-event');
    expect(conflict?.sources).toEqual(['gdelt-events']);
    expect(conflict?.swatch?.layerId).toBe('gdelt-events');
    expect(conflict?.swatch?.point?.type).toBe('circle');
    // No current source: the kind's first style stands for it.
    expect(catalog.kinds.find((e) => e.id === 'aircraft')?.swatch?.layerId).toBe('adsbfi-mil');
  });

  it('carries the aggregation zoom and a source’s kinds from the style', () => {
    expect(catalog.kinds.find((e) => e.id === 'aircraft')?.aggBelowZoom).toBe(7);
    expect(catalog.sources.find((e) => e.id === 'aprs-is')?.kinds).toEqual([
      'aprs-station',
      'aprs-message',
    ]);
  });

  it('builds without a style: no icons, no source kinds', () => {
    const bare = buildCatalog(index, kinds, undefined);
    expect(bare.kinds.every((e) => e.swatch === undefined)).toBe(true);
    expect(bare.sources.every((e) => e.kinds.length === 0 && e.count === undefined)).toBe(true);
  });
});

describe('defaultEnabled', () => {
  it('turns on every kind layer with records now', () => {
    expect(defaultEnabled(buildCatalog(index, kinds, model))).toEqual([
      'aprs-station',
      'conflict-event',
    ]);
  });
});

describe('enabledKinds', () => {
  const catalog = buildCatalog(index, kinds, model);

  it('scopes a kind layer to its current sources, or any source when it has none', () => {
    const scope = enabledKinds(catalog, new Set(['conflict-event', 'aircraft']));
    expect([...scope].map(([kind, sources]) => [kind, [...sources]])).toEqual([
      ['conflict-event', ['gdelt-events']],
      ['aircraft', ['*']],
    ]);
  });

  it('scopes a source layer to its own kinds, merged with kind layers', () => {
    const scope = enabledKinds(catalog, new Set(['conflict-event', 'acled', 'aprs-is']));
    expect([...(scope.get('conflict-event') ?? [])]).toEqual(['gdelt-events', 'acled']);
    expect([...(scope.get('aprs-message') ?? [])]).toEqual(['aprs-is']);
  });

  it('is empty when nothing is on', () => {
    expect(enabledKinds(catalog, new Set()).size).toBe(0);
  });
});
