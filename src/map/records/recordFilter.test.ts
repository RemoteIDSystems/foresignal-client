// @vitest-environment node
import type { RecordFeature } from './decodeTile';
import { RecordClaims, recordId, shownRecords } from './recordFilter';

const point = (properties: RecordFeature['properties']): RecordFeature => ({
  layer: 'earthquake',
  properties,
  geometry: { type: 'point', points: [[0, 0]] },
});

describe('recordId', () => {
  it('is the source and its id, and nothing without both', () => {
    expect(recordId({ source: 'usgs-earthquakes', externalId: 'us7000abcd' })).toBe(
      'usgs-earthquakes\u0000us7000abcd',
    );
    expect(recordId({ source: 'a', externalId: 7 })).toBe('a\u00007');
    expect(recordId({ externalId: 'x' })).toBeUndefined();
    expect(recordId({ source: 'a' })).toBeUndefined();
  });
});

describe('shownRecords', () => {
  const features = [
    point({ source: 'usgs-earthquakes', externalId: '1' }),
    point({ source: 'emsc-seismic', externalId: '2' }),
    point({ externalId: '3' }),
  ];

  it('keeps everything when no source is hidden', () => {
    expect(shownRecords(features, new Set())).toEqual(features);
  });

  it('drops the hidden sources’ records, keeping records that name no source', () => {
    expect(
      shownRecords(features, new Set(['emsc-seismic'])).map((f) => f.properties.externalId),
    ).toEqual(['1', '3']);
  });
});

describe('RecordClaims', () => {
  it('lets one tile hold a record, and another take it once the first is released', () => {
    const claims = new RecordClaims();
    expect(claims.claim('r1', '2/0/1')).toBe(true);
    // The same tile drawing it again keeps it.
    expect(claims.claim('r1', '2/0/1')).toBe(true);
    expect(claims.claim('r1', '2/1/1')).toBe(false);
    expect(claims.claim('r2', '2/1/1')).toBe(true);
    claims.release('2/0/1');
    expect(claims.size).toBe(1);
    expect(claims.claim('r1', '2/1/1')).toBe(true);
  });
});
