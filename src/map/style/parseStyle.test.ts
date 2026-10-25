// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/overlay-style.json';
import {
  colorFor,
  kindLabel,
  representativeColor,
  sourceLayer,
  stylesForKind,
  valueAtZoom,
  type KindStyle,
} from './model';
import {
  parseColor,
  parseIconImage,
  parseFilter,
  parseOverlayStyle,
  parseZoomValue,
  type MapStyle,
} from './parseStyle';

/**
 * `fixtures/overlay-style.json` is six layers cut unchanged from the live backend's
 * `GET /v1/map/style.json?theme=dark` (generated 2026-10-18): three sources that draw
 * `conflict-event` three different ways, an aircraft layer with rotation and hexagon aggregation,
 * a layer carrying two kinds, and a layer colored by severity.
 */
const style = fixture as unknown as MapStyle;
const model = parseOverlayStyle(style);

/** The styles for a kind, failing the test when there are fewer than `count`. */
function stylesOf(kind: string, count = 1): KindStyle[] {
  const found = stylesForKind(model, kind);
  expect(found.length).toBeGreaterThanOrEqual(count);
  return found;
}

/** The first style for a kind. */
function firstStyle(kind: string): KindStyle {
  return stylesOf(kind)[0] as KindStyle;
}

describe('parseOverlayStyle', () => {
  it('reads the header and every requested layer with its attribution and zooms', () => {
    expect(model.theme).toBe('dark');
    expect(model.generatedAt).toBe('2026-10-18T22:38:23.229787036Z');
    expect(model.spriteUrl).toBe('http://localhost:8080/v1/map/sprites/foresignal-1b0f0988');
    expect(model.layers.map((l) => l.id)).toEqual([
      'acled',
      'adsbfi-mil',
      'aprs-is',
      'awc-gairmets',
      'gdelt-events',
      'ucdp-ged',
    ]);
    expect(sourceLayer(model, 'acled')).toEqual({
      id: 'acled',
      kinds: ['conflict-event'],
      attribution: 'Armed Conflict Location & Event Data (ACLED), acleddata.com',
      minzoom: 0,
      tileJsonUrl: 'http://localhost:8080/v1/tiles/acled.json',
    });
    expect(model.skipped).toEqual([]);
  });

  it('lists each kind once and every icon the styles use', () => {
    expect(model.kinds).toEqual([
      'aircraft',
      'aprs-message',
      'aprs-station',
      'aviation-hazard',
      'conflict-event',
    ]);
    expect(model.icons).toEqual(['antenna', 'danger', 'fighter-jet', 'information', 'warning']);
  });

  it('keeps one style per source for a kind that sources draw differently', () => {
    const conflict = stylesForKind(model, 'conflict-event');
    expect(conflict.map((s) => [s.layerId, s.point?.type])).toEqual([
      ['acled', 'icon'],
      ['gdelt-events', 'circle'],
      ['ucdp-ged', 'icon'],
    ]);
    const [acled, gdelt, ucdp] = stylesOf('conflict-event', 3) as [KindStyle, KindStyle, KindStyle];
    expect(acled.point).toMatchObject({
      icon: 'danger',
      color: { type: 'constant', color: '#C92A2A' },
    });
    expect(ucdp.point).toMatchObject({
      icon: 'danger',
      color: { type: 'constant', color: '#A61E4D' },
    });
    expect(gdelt.point).toMatchObject({
      type: 'circle',
      color: { type: 'constant', color: '#4DABF7' },
      radius: {
        stops: [
          [0, 2],
          [8, 4],
          [14, 6],
        ],
      },
      opacity: 0.9,
      strokeColor: '#1D1F23',
      strokeWidth: 1,
    });
  });

  it('gives every kind its point, line, fill and outline with the geometry each accepts', () => {
    const acled = firstStyle('conflict-event');
    expect(acled.point?.filter.geometry).toEqual(['point']);
    expect(acled.line?.filter.geometry).toEqual(['line']);
    expect(acled.fill?.filter.geometry).toEqual(['polygon']);
    expect(acled.outline?.filter.geometry).toEqual(['polygon']);
    expect(acled.fill).toMatchObject({
      opacity: 0.25,
      color: { type: 'constant', color: '#C92A2A' },
    });
    expect(acled.outline?.width).toBe(1.5);
    expect(acled.line?.width).toEqual({
      stops: [
        [0, 1],
        [10, 2.5],
      ],
    });
  });

  it('reads the rotation field, halo and zoom range of an aircraft icon', () => {
    const aircraft = firstStyle('aircraft');
    expect(aircraft.point).toMatchObject({
      type: 'icon',
      icon: 'fighter-jet',
      rotateField: 'track',
      rotationAlignment: 'map',
      haloColor: '#1D1F23',
      haloWidth: 1,
      minzoom: 7,
    });
  });

  it('attaches the hexagon aggregation and aggBelowZoom to their layer', () => {
    const layer = sourceLayer(model, 'adsbfi-mil');
    expect(layer?.aggBelowZoom).toBe(7);
    expect(layer?.aggregation).toEqual({
      layerId: 'adsbfi-mil--agg',
      tiles: ['http://localhost:8080/v1/tiles/adsbfi-mil/{z}/{x}/{y}.mvt?agg=hex'],
      minzoom: 0,
      maxzoom: 7,
      countField: 'count',
      ramp: [
        [1, '#1C3D5A'],
        [10, '#1C7ED6'],
        [100, '#74C0FC'],
        [1000, '#E7F5FF'],
      ],
      opacity: 0.6,
      outlineColor: '#1D1F23',
    });
    expect(sourceLayer(model, 'acled')?.aggBelowZoom).toBeUndefined();
  });

  it('splits a two-kind layer by its kind filter', () => {
    const station = stylesForKind(model, 'aprs-station');
    const message = stylesForKind(model, 'aprs-message');
    expect(station.map((s) => s.layerId)).toEqual(['aprs-is']);
    expect(message.map((s) => s.layerId)).toEqual(['aprs-is']);
    expect(station[0]?.point?.filter).toMatchObject({ kind: 'aprs-station', geometry: ['point'] });
    expect(station[0]?.point).toMatchObject({ icon: 'antenna' });
  });

  it('reads a severity match and evaluates it per feature', () => {
    const point = stylesForKind(model, 'aviation-hazard')[0]?.point;
    const color = point?.type === 'icon' ? point.color : undefined;
    expect(color).toMatchObject({
      type: 'match',
      field: 'severity',
      caseInsensitive: true,
      fallback: '#F59F00',
    });
    expect(colorFor(color!, { severity: 'Extreme' })).toBe('#C92A2A');
    expect(colorFor(color!, { severity: 'watch' })).toBe('#F08C00');
    expect(colorFor(color!, { severity: 'unheard-of' })).toBe('#F59F00');
    expect(colorFor(color!, {})).toBe('#F59F00');
    expect(representativeColor(color!)).toBe('#F59F00');
  });

  it('lists a layer it cannot place instead of failing', () => {
    const extra: MapStyle = {
      ...style,
      layers: [
        ...style.layers,
        { id: 'stray', type: 'symbol', source: 'nowhere', 'source-layer': 'nowhere' },
        {
          id: 'acled--heatmap',
          type: 'heatmap',
          source: 'acled',
          'source-layer': 'acled',
        },
      ],
    };
    expect(parseOverlayStyle(extra).skipped).toEqual(['stray', 'acled--heatmap']);
  });
});

describe('expression readers', () => {
  it('keeps a color expression it does not interpret', () => {
    const raw = ['case', ['has', 'x'], '#000', '#fff'];
    expect(parseColor(raw)).toEqual({ type: 'expression', raw });
    expect(colorFor({ type: 'expression', raw })).toBeUndefined();
  });

  it('reads an icon chosen by a field, and a constant icon, and refuses anything else', () => {
    expect(parseIconImage('plane')).toEqual({ icon: 'plane' });
    expect(
      parseIconImage([
        'match',
        ['downcase', ['get', 'chartSymbol']],
        'hard',
        'airport-hard',
        'airport-soft',
      ]),
    ).toEqual({
      icon: 'airport-soft',
      iconMatch: {
        field: 'chartSymbol',
        caseInsensitive: true,
        cases: [{ values: ['hard'], icon: 'airport-hard' }],
      },
    });
    expect(parseIconImage(['get', 'icon'])).toBeUndefined();
    expect(parseIconImage(undefined)).toBeUndefined();
  });

  it('reads zoom ramps and rejects data-driven sizes', () => {
    expect(parseZoomValue(3)).toBe(3);
    expect(
      parseZoomValue(['interpolate', ['linear'], ['get', 'mag'], 0, 2, 8, 10]),
    ).toBeUndefined();
    const ramp = parseZoomValue(['interpolate', ['linear'], ['zoom'], 0, 2, 8, 4, 14, 6])!;
    expect(valueAtZoom(ramp, -1)).toBe(2);
    expect(valueAtZoom(ramp, 4)).toBe(3);
    expect(valueAtZoom(ramp, 11)).toBe(5);
    expect(valueAtZoom(ramp, 20)).toBe(6);
  });

  it('reads a filter with no clauses as unrestricted', () => {
    expect(parseFilter(undefined)).toEqual({ geometry: [] });
  });

  it('labels kinds for people', () => {
    expect(kindLabel('conflict-event')).toBe('Conflict Event');
    expect(kindLabel('aprs_station')).toBe('APRS Station');
  });
});
