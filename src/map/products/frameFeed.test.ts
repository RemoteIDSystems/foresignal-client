import { createForesignalClient } from '../../api/client';
import type { Change } from '../../api/stream/ChangeStream';
import { FrameFeed, frameFeedFor, frameFromChange } from './frameFeed';

/** A `raster-frame` change as the stream carries it (its payload always inline). */
function frameChange(payload: Record<string, unknown> | null, tombstone = false): Change {
  return {
    seq: 9,
    source: 'goes-east',
    externalId: 'goes-east-ir',
    kind: 'raster-frame',
    version: 4,
    observedAt: '2026-10-20T12:00:00Z',
    tombstone,
    leftFilter: false,
    payload,
  };
}

const observation = {
  productId: 'goes-east-ir',
  frameKey: '20261020T1200Z~abcd1234',
  time: '2026-10-20T12:00:00Z',
  timeKey: '20261020T1200Z',
  tiles: '/v1/products/goes-east-ir/tiles/20261020T1200Z~abcd1234/{z}/{x}/{y}.png',
  bounds: [-150, -60, -10, 60],
};

describe('frameFromChange', () => {
  it('reads an observation frame from its payload', () => {
    expect(frameFromChange(frameChange(observation))).toEqual({
      ...observation,
      status: 'complete',
    });
  });

  it('gives nothing for a forecast run, a tombstone, another kind or a missing payload', () => {
    expect(
      frameFromChange(
        frameChange({ productId: 'gfs', run: 'x', steps: [0], validTimes: [], tilesTemplate: 't' }),
      ),
    ).toBeUndefined();
    expect(frameFromChange(frameChange(observation, true))).toBeUndefined();
    expect(frameFromChange({ ...frameChange(observation), kind: 'earthquake' })).toBeUndefined();
    expect(frameFromChange(frameChange(null))).toBeUndefined();
  });
});

describe('FrameFeed', () => {
  it('hands each frame to the layers of its product only', () => {
    const feed = new FrameFeed();
    const ir = vi.fn();
    const other = vi.fn();
    const stop = feed.subscribe('goes-east-ir', ir);
    feed.subscribe('radar', other);
    const frame = frameFromChange(frameChange(observation))!;
    feed.offer(frame);
    expect(ir).toHaveBeenCalledWith(frame);
    expect(other).not.toHaveBeenCalled();
    stop();
    feed.offer(frame);
    expect(ir).toHaveBeenCalledTimes(1);
  });

  it('is one per API client', () => {
    const api = createForesignalClient({ baseUrl: 'http://api.test' });
    expect(frameFeedFor(api)).toBe(frameFeedFor(api));
  });
});
