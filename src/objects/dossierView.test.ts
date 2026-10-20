import type { Dossier } from './objectApi';
import {
  actionLabel,
  envelopePoint,
  fieldFacts,
  formatLatLon,
  formatPanelTime,
  keyFacts,
  relatedCount,
  sectionMessage,
  statusTone,
} from './dossierView';

const dossier: Dossier = {
  ref: 'record:usgs-earthquakes/nc1',
  generatedAt: '2026-10-20T12:00:00Z',
  envelope: {
    ref: 'record:usgs-earthquakes/nc1',
    type: 'record',
    title: 'M 2.5 - 2 km NW of The Geysers, CA',
    status: 'expired',
    time: { start: '2026-10-20T16:23:04Z', observedAt: '2026-10-20T16:52:22.950Z' },
    geometry: { type: 'Point', coordinates: [-122.7716675, 38.7866669] } as never,
  },
  sections: {
    overview: {
      status: 'ok',
      fields: {
        kind: 'earthquake',
        version: 4,
        place: '2 km NW of The Geysers, CA',
        mag: 2.5,
        depth: 0.469999998807907,
        detail: 'https://earthquake.usgs.gov/x',
        tsunami: 0,
        nested: { no: true },
      },
    },
    related: {
      status: 'ok',
      nearby: [{} as never, {} as never],
      historical: [{} as never],
    },
  },
};

describe('the dossier’s key facts', () => {
  it('gives the type, the first fields, the location and the last update, then the rest', () => {
    const { key, more } = keyFacts(dossier, 'Earthquake');
    expect(key).toEqual([
      { label: 'Type', value: 'Earthquake' },
      { label: 'Place', value: '2 km NW of The Geysers, CA' },
      { label: 'Mag', value: '2.5' },
      { label: 'Depth', value: '0.47' },
      { label: 'Location', value: '38.8°N, 122.8°W' },
      { label: 'Last Update', value: '2026-10-20 16:52Z' },
    ]);
    expect(more).toEqual([{ label: 'Tsunami', value: '0' }]);
  });

  it('leaves links, bookkeeping and nested values out of the fields', () => {
    expect(fieldFacts({ url: 'x', detail: 'https://a', a: { b: 1 }, b: '', c: true })).toEqual([
      { label: 'C', value: 'Yes' },
    ]);
  });

  it('splits camel-case and snake-case field names into words', () => {
    expect(fieldFacts({ maxWind: 70, ground_speed: 452 }).map((fact) => fact.label)).toEqual([
      'Max Wind',
      'Ground Speed',
    ]);
  });

  it('writes places and times as the mock does', () => {
    expect(formatLatLon(-76.5, 28.4)).toBe('28.4°N, 76.5°W');
    expect(formatLatLon(151.2, -33.9)).toBe('33.9°S, 151.2°E');
    expect(formatPanelTime('2025-09-18T14:00:31Z')).toBe('2025-09-18 14:00Z');
  });

  it('finds the point of an envelope with only a bbox', () => {
    expect(envelopePoint({ ref: 'x:1', type: 'x', title: 'X', bbox: [0, 0, 10, 20] })).toEqual([
      5, 10,
    ]);
    expect(envelopePoint({ ref: 'x:1', type: 'x', title: 'X' })).toBeUndefined();
  });
});

describe('the dossier’s sections and actions', () => {
  it('says why a section has nothing, preferring the backend’s message', () => {
    expect(sectionMessage('ok', 'Imagery')).toBeUndefined();
    expect(sectionMessage('empty', 'Imagery')).toBe('No imagery for this object.');
    expect(sectionMessage('unavailable', 'Forecast')).toBe('Forecast is unavailable right now.');
    expect(sectionMessage('not-installed', 'Impacts')).toBe(
      'Impacts is not installed on this server.',
    );
    expect(sectionMessage('unavailable', 'Imagery', 'STAC catalog timed out')).toBe(
      'STAC catalog timed out',
    );
  });

  it('counts related objects across their groups', () => {
    expect(relatedCount(dossier)).toBe(3);
    expect(relatedCount({ ...dossier, sections: { related: { status: 'unavailable' } } })).toBe(0);
  });

  it('labels actions and tones statuses', () => {
    expect(actionLabel({ id: 'add-to-workspace', method: 'POST', href: '/x', scope: 'read' })).toBe(
      'Add to Workspace',
    );
    expect(actionLabel({ id: 'x', label: 'Track', method: 'GET', href: '/x', scope: 'read' })).toBe(
      'Track',
    );
    expect(statusTone('Active')).toBe('success');
    expect(statusTone('expired')).toBe('neutral');
  });
});
