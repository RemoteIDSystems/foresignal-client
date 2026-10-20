// @vitest-environment node
import fixture from '../style/fixtures/overlay-style.json';
import { parseOverlayStyle, type MapStyle } from '../style/parseStyle';
import { resolveSymbol, styleForRecord, UNSTYLED_COLOR } from './featureStyle';

/** The 006 fixture: six layers cut unchanged from the live dark style. */
const model = parseOverlayStyle(fixture as unknown as MapStyle);
const conflict = (source: string) => ({ source, kind: 'conflict-event' });

describe('styleForRecord', () => {
  it('uses the style of the record’s own source and kind', () => {
    expect(styleForRecord(model, 'conflict-event', conflict('gdelt-events'))?.layerId).toBe(
      'gdelt-events',
    );
    expect(styleForRecord(model, 'ucdp-ged', conflict('ucdp-ged'))?.layerId).toBe('ucdp-ged');
  });

  it('falls back to another source’s style for the kind, and to the layer’s single kind', () => {
    expect(styleForRecord(model, 'conflict-event', conflict('some-new-feed'))?.layerId).toBe(
      'acled',
    );
    expect(styleForRecord(model, 'acled', {})?.kind).toBe('conflict-event');
    expect(styleForRecord(model, 'nope', { kind: 'unknown-kind' })).toBeUndefined();
  });
});

describe('resolveSymbol', () => {
  it('draws each source’s look for the same kind', () => {
    expect(resolveSymbol(model, 'acled', conflict('acled'), 'point', 3)).toMatchObject({
      point: { type: 'icon', icon: 'danger', color: '#C92A2A' },
    });
    expect(resolveSymbol(model, 'ucdp-ged', conflict('ucdp-ged'), 'point', 3)).toMatchObject({
      point: { type: 'icon', icon: 'danger', color: '#A61E4D' },
    });
    const gdelt = resolveSymbol(model, 'gdelt-events', conflict('gdelt-events'), 'point', 3);
    expect(gdelt).toMatchObject({ point: { type: 'circle', color: '#4DABF7' } });
    expect(
      gdelt?.type === 'point' && gdelt.point.type === 'circle' && gdelt.point.radius,
    ).toBeGreaterThan(0);
  });

  it('hides a point below its style’s minzoom and rotates it by its heading field', () => {
    const aircraft = { source: 'adsbfi-mil', kind: 'aircraft', track: 90 };
    expect(resolveSymbol(model, 'adsbfi-mil', aircraft, 'point', 6.5)).toBeUndefined();
    expect(resolveSymbol(model, 'adsbfi-mil', aircraft, 'point', 8)).toMatchObject({
      point: { type: 'icon', icon: 'fighter-jet', rotation: 90, rotationAlignment: 'map' },
    });
    const noHeading = resolveSymbol(model, 'adsbfi-mil', { ...aircraft, track: 'n/a' }, 'point', 8);
    expect(
      noHeading?.type === 'point' && noHeading.point.type === 'icon' && noHeading.point.rotation,
    ).toBeUndefined();
  });

  it('colors by severity, with the fallback for an unknown value', () => {
    const hazard = (severity?: string) =>
      resolveSymbol(
        model,
        'awc-gairmets',
        { source: 'awc-gairmets', kind: 'aviation-hazard', ...(severity ? { severity } : {}) },
        'point',
        3,
      );
    const severe = hazard('SEVERE');
    const other = hazard();
    expect(severe?.type === 'point' && severe.point.color).not.toBe(
      other?.type === 'point' && other.point.color,
    );
  });

  it('draws lines and polygons with their widths at the zoom', () => {
    const line = resolveSymbol(model, 'acled', conflict('acled'), 'line', 10);
    expect(line).toMatchObject({ type: 'line', line: { color: '#C92A2A' } });
    const area = resolveSymbol(model, 'acled', conflict('acled'), 'polygon', 4);
    expect(area).toMatchObject({
      type: 'polygon',
      fill: { color: '#C92A2A' },
      outline: { color: '#C92A2A' },
    });
  });

  it('draws a record the style does not know in neutral gray', () => {
    expect(resolveSymbol(model, 'x', { kind: 'brand-new' }, 'point', 3)).toMatchObject({
      point: { type: 'circle', color: UNSTYLED_COLOR },
    });
    expect(resolveSymbol(model, 'x', { kind: 'brand-new' }, 'polygon', 3)).toMatchObject({
      fill: { color: UNSTYLED_COLOR },
    });
  });
});
