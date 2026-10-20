import { frameFeature, HistoryPlayback, type FrameItem, type HistoryFrames } from './history';

function item(id: string, lon: number, version = 1): FrameItem {
  return {
    id: `usgs-earthquakes:${id}`,
    kind: 'earthquake',
    title: `Quake ${id}`,
    observedAt: '2026-10-20T10:00:00Z',
    version,
    lon,
    lat: 10,
    props: { mag: 4.5, place: 'Somewhere', nested: { no: true } },
  };
}

const frames: HistoryFrames = {
  asOf: '2026-10-20T10:00:00Z',
  step: '30m',
  watermarkSeq: 1048,
  keyframe: [item('a', 1), item('b', 2)],
  frames: [
    { t: '2026-10-20T10:30:00Z', upserts: [item('c', 3)], removals: [] },
    {
      t: '2026-10-20T11:00:00Z',
      upserts: [item('a', 5, 2)],
      removals: [{ id: 'usgs-earthquakes:b', reason: 'expired', left: false }],
    },
  ],
};

describe('HistoryPlayback', () => {
  it('starts at the keyframe and applies each frame in order', () => {
    const playback = new HistoryPlayback(frames);
    expect(playback.length).toBe(3);
    const ids = (index: number) => playback.stateAt(index).map((entity) => entity.id.split(':')[1]);
    expect(ids(0)).toEqual(['a', 'b']);
    expect(ids(1)).toEqual(['a', 'b', 'c']);
    expect(ids(2)).toEqual(['a', 'c']);
    // The upsert replaced the earlier version of `a`.
    expect(playback.stateAt(2).find((entity) => entity.id.endsWith(':a'))?.lon).toBe(5);
    // Stepping back gives the earlier state again, unchanged.
    expect(ids(0)).toEqual(['a', 'b']);
  });

  it('names each step’s instant, and finds the step for an instant', () => {
    const playback = new HistoryPlayback(frames);
    expect([0, 1, 2].map((i) => playback.timeAt(i))).toEqual([
      '2026-10-20T10:00:00Z',
      '2026-10-20T10:30:00Z',
      '2026-10-20T11:00:00Z',
    ]);
    expect(playback.indexAt(Date.parse('2026-10-20T10:45:00Z'))).toBe(1);
    expect(playback.indexAt(Date.parse('2026-10-20T09:00:00Z'))).toBe(0);
    expect(playback.indexAt(Date.parse('2026-10-20T12:00:00Z'))).toBe(2);
    expect(playback.timeAt(9)).toBe('2026-10-20T11:00:00Z');
  });

  it('says when the backend’s frames are approximate', () => {
    expect(new HistoryPlayback(frames).approximate).toBe(false);
    expect(new HistoryPlayback({ ...frames, approximate: true }).approximate).toBe(true);
  });
});

describe('frameFeature', () => {
  it('draws a frame entity as a tile’s point record, with its source, id, kind and title', () => {
    expect(frameFeature(item('a', 1))).toEqual({
      layer: 'usgs-earthquakes',
      properties: {
        mag: 4.5,
        place: 'Somewhere',
        source: 'usgs-earthquakes',
        externalId: 'a',
        kind: 'earthquake',
        title: 'Quake a',
      },
      geometry: { type: 'point', points: [[1, 10]] },
    });
  });

  it('keeps an external id that holds a colon whole, and skips an entity with no position', () => {
    const feature = frameFeature({ ...item('x', 1), id: 'src:urn:x:1' });
    expect(feature?.properties.externalId).toBe('urn:x:1');
    expect(frameFeature({ ...item('a', 1), lon: null })).toBeUndefined();
  });
});
