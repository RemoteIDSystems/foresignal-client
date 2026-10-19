// @vitest-environment node
import fixture from './fixtures/overlay-style.json';
import { buildLegend } from './legendModel';
import { parseOverlayStyle, type MapStyle } from './parseStyle';

/**
 * The legend grouping over a style cut unchanged from the live dark style (see
 * `parseStyle.test.ts` for what the fixture holds).
 */
const model = parseOverlayStyle(fixture as unknown as MapStyle);

describe('buildLegend', () => {
  it('lists one entry per kind, sorted by label', () => {
    expect(buildLegend(model).map((entry) => [entry.kind, entry.label])).toEqual([
      ['aircraft', 'Aircraft'],
      ['aprs-message', 'Aprs message'],
      ['aprs-station', 'Aprs station'],
      ['aviation-hazard', 'Aviation hazard'],
      ['conflict-event', 'Conflict event'],
    ]);
  });

  it('keeps a kind drawn differently by different sources as separate looks', () => {
    const conflict = buildLegend(model).find((entry) => entry.kind === 'conflict-event');
    expect(conflict?.variants.map((v) => [v.layerIds, v.style.point?.type])).toEqual([
      [['acled'], 'icon'],
      [['gdelt-events'], 'circle'],
      // Same icon as ACLED, different color: a separate look.
      [['ucdp-ged'], 'icon'],
    ]);
    expect(conflict?.variants[1]?.sources).toEqual([
      'The GDELT Project (https://www.gdeltproject.org)',
    ]);
  });

  it('carries the aggregation zoom and ramp, and the point minzoom', () => {
    const aircraft = buildLegend(model).find((entry) => entry.kind === 'aircraft');
    expect(aircraft).toMatchObject({
      aggBelowZoom: 7,
      minzoom: 7,
      aggRamp: [
        [1, '#1C3D5A'],
        [10, '#1C7ED6'],
        [100, '#74C0FC'],
        [1000, '#E7F5FF'],
      ],
    });
    const station = buildLegend(model).find((entry) => entry.kind === 'aprs-station');
    expect(station?.aggBelowZoom).toBeUndefined();
    expect(station?.minzoom).toBeUndefined();
  });

  it('exposes the severity color cases a kind is colored by', () => {
    const hazard = buildLegend(model).find((entry) => entry.kind === 'aviation-hazard');
    expect(hazard?.colorCases?.field).toBe('severity');
    expect(hazard?.colorCases?.cases.length).toBeGreaterThan(0);
    expect(hazard?.colorCases?.fallback).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('filters by label, id or source, case-insensitively', () => {
    expect(buildLegend(model, 'APRS').map((entry) => entry.kind)).toEqual([
      'aprs-message',
      'aprs-station',
    ]);
    expect(buildLegend(model, 'gdelt').map((entry) => entry.kind)).toEqual(['conflict-event']);
    expect(buildLegend(model, 'nothing like this')).toEqual([]);
  });
});
