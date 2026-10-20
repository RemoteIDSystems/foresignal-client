// @vitest-environment node
import { parseTileTemplate } from './tileTemplate';

describe('parseTileTemplate', () => {
  it('reads the layer from a live template and ignores its host', () => {
    expect(
      parseTileTemplate('http://localhost:8080/v1/tiles/usgs-earthquakes/{z}/{x}/{y}.mvt'),
    ).toEqual({ layer: 'usgs-earthquakes', query: {} });
    expect(parseTileTemplate('/v1/tiles/earthquake/{z}/{x}/{y}.mvt')).toEqual({
      layer: 'earthquake',
      query: {},
    });
  });

  it('keeps a concrete asOf, a known agg and a ticket', () => {
    expect(
      parseTileTemplate(
        'https://api.example/v1/tiles/acled/{z}/{x}/{y}.mvt?asOf=2026-10-01T00:00:00Z&agg=none&ticket=t1',
      ),
    ).toEqual({
      layer: 'acled',
      query: { asOf: '2026-10-01T00:00:00Z', agg: 'none', ticket: 't1' },
    });
  });

  it('drops an agg value getTile does not accept', () => {
    expect(parseTileTemplate('/v1/tiles/acled/{z}/{x}/{y}.mvt?agg=cluster')?.query).toEqual({});
  });

  it('rejects a time alias, which would change the layer under a fixed URL', () => {
    expect(parseTileTemplate('/v1/tiles/acled/{z}/{x}/{y}.mvt?asOf=latest')).toBeUndefined();
    expect(parseTileTemplate('/v1/tiles/acled/{z}/{x}/{y}.mvt?asOf=NOW')).toBeUndefined();
  });

  it('rejects a template of another shape', () => {
    expect(parseTileTemplate('/v1/tiles/acled/{z}/{x}/{y}.png')).toBeUndefined();
    expect(parseTileTemplate('/v1/other/acled/{z}/{x}/{y}.mvt')).toBeUndefined();
    expect(parseTileTemplate('/v1/tiles/{z}/{x}/{y}.mvt')).toBeUndefined();
  });
});
