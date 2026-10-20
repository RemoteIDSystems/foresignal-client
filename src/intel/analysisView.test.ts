// @vitest-environment node
import {
  analysisPath,
  changesLines,
  confidenceLook,
  durationText,
  envelopeAllows,
  focusOf,
  itemRef,
  itemRows,
  itemsArea,
  memberCategories,
  scopeText,
  timelineRows,
  utcText,
} from './analysisView';
import { changes, investigation, investigationEnvelope, timeline } from './testing/fixtures';

describe('analysisPath', () => {
  it('routes situations and investigations to their full-analysis views, and nothing else', () => {
    expect(analysisPath('situation:01JA8Q0000000000000000000A')).toBe(
      '/intelligence/situations/01JA8Q0000000000000000000A',
    );
    expect(analysisPath('investigation:INV-2026-0001')).toBe(
      '/intelligence/investigations/INV-2026-0001',
    );
    expect(analysisPath('record:usgs-earthquakes/nc1')).toBeUndefined();
    expect(analysisPath('not a ref')).toBeUndefined();
  });
});

describe('the header', () => {
  it('says how long something has run, as the mock writes it', () => {
    const now = new Date('2025-09-18T12:00:00Z');
    expect(durationText('2022-02-24T00:00:00Z', now)).toBe('3 yrs 6 mos');
    expect(durationText('2025-09-06T00:00:00Z', now)).toBe('12 days');
    expect(durationText('2025-09-18T07:00:00Z', now)).toBe('5 h');
    expect(durationText('2025-09-18T11:30:00Z', now)).toBe('under an hour');
  });

  it('names the scope from the region codes', () => {
    expect(scopeText([])).toBe('No region');
    expect(scopeText(['ZZ'])).toBe('No region');
    expect(scopeText(['UA', 'RU'])).toBe('UA, RU');
    expect(scopeText(['UA', 'RU', 'PL', 'RO', 'MD'])).toBe('5 regions');
  });

  it('reads the confidence gauge from the corroboration share', () => {
    expect(confidenceLook(0.72)).toEqual({ percent: 72, label: 'HIGH', tone: 'success' });
    expect(confidenceLook(0.5)).toEqual({ percent: 50, label: 'MODERATE', tone: 'warning' });
    expect(confidenceLook(0.1)).toEqual({ percent: 10, label: 'LOW', tone: 'danger' });
    expect(confidenceLook(null)).toBeUndefined();
  });

  it('writes instants in UTC to the minute', () => {
    expect(utcText('2025-09-18T14:32:10Z')).toBe('2025-09-18 14:32Z');
    expect(utcText(null)).toBe('—');
  });
});

describe('the timeline and what changed', () => {
  it('lists members and log entries newest first, a member with its object', () => {
    const rows = timelineRows(timeline);
    expect(rows.map((row) => row.title)).toEqual([
      'Power outage near Santa Rosa',
      'M 4.6 - 10 km NE of The Geysers',
      'Situation opened: emerging',
    ]);
    expect(rows[1]).toMatchObject({ tag: 'seismic', ref: 'record:usgs-earthquakes/nc75095651' });
    expect(rows[2]!.ref).toBeUndefined();
  });

  it('says what changed, and nothing when nothing did', () => {
    expect(changesLines(changes)).toEqual([
      'Status emerging → active',
      '2 new members (seismic 1, outage 1)',
      'Area +312 km²',
      'Regions added: US-CA',
    ]);
    expect(
      changesLines({
        ...changes,
        status: { after: 'active', changed: false },
        newMembers: { total: 0, byFamily: {} },
        area: {},
        regionsAdded: [],
      }),
    ).toEqual([]);
  });
});

describe('the map', () => {
  it('flies to a box from high enough to see it', () => {
    expect(focusOf([-123.2, 38.4, -122.4, 39.0])).toEqual({
      longitude: expect.closeTo(-122.8, 9),
      latitude: expect.closeTo(38.7, 9),
      height: 200_000,
    });
    expect(focusOf([-10, 40, 30, 60])!.height).toBeCloseTo(40 * 111_000 * 1.6);
    expect(focusOf(null)).toBeUndefined();
  });

  it('finds an investigation’s footprint in its items’ snapshots', () => {
    expect(itemsArea(investigation.items!)).toEqual({
      geometries: [{ type: 'Point', coordinates: [-122.8, 38.8] }],
      bbox: [-122.8, 38.8, -122.8, 38.8],
    });
    expect(itemsArea([])).toEqual({ geometries: [] });
  });

  it('turns on the categories of the members’ kinds, in the rail’s order', () => {
    expect(memberCategories(['earthquake', 'vessel', 'earthquake'])).toEqual(
      memberCategories(['vessel', 'earthquake']),
    );
    expect(memberCategories([])).toEqual([]);
  });
});

describe('investigation items', () => {
  it('reads each item’s object ref, and selects nothing it cannot name', () => {
    const [record, note] = investigation.items!;
    expect(itemRef(record!)).toBe('record:usgs-earthquakes/nc75095651@12');
    expect(itemRef(note!)).toBeUndefined();
    expect(itemRef({ ...note!, itemType: 'alert', ref: '42' })).toBe('alert:42');
    expect(itemRef({ ...note!, itemType: 'event', ref: '01JA' })).toBeUndefined();
    expect(itemRef({ ...note!, objectRef: 'place:home' })).toBe('place:home');
  });

  it('lists items newest first, by their snapshot title or note', () => {
    expect(itemRows(investigation.items!).map((row) => row.title)).toEqual([
      'Check the grid operator’s statement',
      'M 4.6 - 10 km NE of The Geysers',
    ]);
  });

  it('reads from the envelope whether items may be added and removed', () => {
    const { actions } = investigationEnvelope;
    expect(envelopeAllows(actions, 'POST', /\/items\/?$/)).toBe(true);
    expect(envelopeAllows(actions, 'DELETE', /\/items\//)).toBe(true);
    expect(envelopeAllows([], 'POST', /\/items\/?$/)).toBe(false);
    expect(envelopeAllows(undefined, 'POST', /\/items\/?$/)).toBe(false);
  });
});
