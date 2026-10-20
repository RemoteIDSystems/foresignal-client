import { formatObjectRef, parseObjectRef, recordRef, refPathSegment } from './objectRef';

describe('object refs', () => {
  it('reads a ref into its type and id', () => {
    expect(parseObjectRef('situation:01JA8Q3V7S2K9W4T6Y1B5N0M3C')).toEqual({
      type: 'situation',
      id: '01JA8Q3V7S2K9W4T6Y1B5N0M3C',
    });
    expect(formatObjectRef('situation', '01JA')).toBe('situation:01JA');
  });

  it('reads a record ref’s source, decoded external id and version', () => {
    expect(parseObjectRef('record:usgs-earthquakes/nc75452571@1030')).toEqual({
      type: 'record',
      id: 'usgs-earthquakes/nc75452571@1030',
      record: { sourceId: 'usgs-earthquakes', externalId: 'nc75452571', seq: 1030 },
    });
    expect(parseObjectRef('record:adsblol-mil/a%2Fb%40c')?.record).toEqual({
      sourceId: 'adsblol-mil',
      externalId: 'a/b@c',
    });
  });

  it('writes a record ref with its external id percent-encoded, and reads it back', () => {
    const ref = recordRef('src', 'a/b@c 1%', 7);
    expect(ref).toBe('record:src/a%2Fb%40c%201%25@7');
    expect(parseObjectRef(ref)?.record).toEqual({
      sourceId: 'src',
      externalId: 'a/b@c 1%',
      seq: 7,
    });
  });

  it('makes a ref one path segment', () => {
    expect(refPathSegment('record:adsblol-mil/ae1234')).toBe('record%3Aadsblol-mil%2Fae1234');
  });

  it('refuses what is not a ref', () => {
    for (const bad of [
      '',
      'nocolon',
      ':id',
      'type:',
      'Bad:x',
      'record:nosource',
      'record:/x',
      'record:s/%E0',
    ]) {
      expect(parseObjectRef(bad)).toBeUndefined();
    }
  });
});
