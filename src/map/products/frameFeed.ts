import type { ForesignalClient } from '../../api/client';
import { RASTER_FRAME_KIND, type Change } from '../../api/stream/ChangeStream';
import type { RasterFrame } from './productApi';

/**
 * New product frames as the live stream announces them, for the layers that draw those products.
 * While the stream is live ({@link live}) a layer takes its frames from here and polls only as a
 * slow safety net.
 */
export class FrameFeed {
  private readonly listeners = new Map<string, Set<(frame: RasterFrame) => void>>();
  /** Whether the live stream is connected now. */
  live = false;

  /** Calls `listener` with each new frame of a product; returns an unsubscribe function. */
  subscribe(productId: string, listener: (frame: RasterFrame) => void): () => void {
    const set = this.listeners.get(productId) ?? new Set();
    set.add(listener);
    this.listeners.set(productId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(productId);
    };
  }

  /** Hands a frame to the layers of its product. */
  offer(frame: RasterFrame): void {
    for (const listener of this.listeners.get(frame.productId) ?? []) listener(frame);
  }
}

const feeds = new WeakMap<ForesignalClient, FrameFeed>();

/** The page's one feed for an API client, shared by the stream bridge and every product layer. */
export function frameFeedFor(api: ForesignalClient): FrameFeed {
  let feed = feeds.get(api);
  if (!feed) {
    feed = new FrameFeed();
    feeds.set(api, feed);
  }
  return feed;
}

/**
 * The frame a `raster-frame` change announces (its inline payload's observation variant: one
 * version per frame, with the frame's own content-addressed tile template), or undefined for any
 * other change, a forecast run (whose frames the map does not draw one by one) or a payload that
 * is not complete.
 */
export function frameFromChange(change: Change): RasterFrame | undefined {
  if (change.kind !== RASTER_FRAME_KIND || change.tombstone) return undefined;
  const payload = change.payload;
  if (!payload) return undefined;
  const { productId, frameKey, time, timeKey, tiles, bounds, expiresAt, stats } = payload;
  if (
    typeof productId !== 'string' ||
    typeof frameKey !== 'string' ||
    typeof time !== 'string' ||
    typeof timeKey !== 'string' ||
    typeof tiles !== 'string'
  ) {
    return undefined;
  }
  const frame: RasterFrame = { productId, frameKey, time, timeKey, tiles, status: 'complete' };
  if (Array.isArray(bounds) && bounds.length === 4) frame.bounds = bounds as number[];
  if (typeof expiresAt === 'string') frame.expiresAt = expiresAt;
  if (stats && typeof stats === 'object') frame.stats = stats as RasterFrame['stats'];
  return frame;
}
