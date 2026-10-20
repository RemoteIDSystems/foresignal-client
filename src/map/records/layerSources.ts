import type { ForesignalClient } from '../../api/client';
import type { RecordFeature } from './decodeTile';
import type { TileId } from './tileMath';
import { tileKey } from './tileMath';
import {
  fetchTile,
  loadLayerTiles,
  type LayerTilesResult,
  type TileAggregation,
  type TileResult,
} from './tileSource';
import type { RecordTileTemplate } from './tileTemplate';

/** Most tile requests in flight across every layer at once. */
export const MAX_TILE_REQUESTS = 12;

/** How long a decoded tile is reused after it arrived, in ms; records are live, so not for long. */
export const TILE_CACHE_MS = 60_000;

/** Most decoded tiles kept for reuse; the least recently used go first. */
export const TILE_CACHE_SIZE = 1_500;

/** How long a layer whose TileJSON failed waits before it is asked for again, in ms. */
const TILE_JSON_RETRY_MS = 30_000;

/** A cached tile: its records and when they arrived. */
interface CachedTile {
  features: RecordFeature[];
  at: number;
}

/**
 * What the record layers share, so turning a layer off and on again, or many layers on at once,
 * costs little: each layer's TileJSON is read once (a failure is asked for again after a while, and
 * a transient one, the backend rate limiting or busy, on the next ask); decoded tiles are kept for
 * {@link TILE_CACHE_MS}, so a layer turned back on, or a view revisited, draws from memory; and
 * TileJSON and tile requests from every layer go through one queue of {@link MAX_TILE_REQUESTS},
 * so a full catalog of layers neither floods the browser's connections with requests that a new
 * view would make stale before they started, nor bursts past the backend's rate limit.
 */
export class LayerSources {
  private readonly tileJson = new Map<string, { result: Promise<LayerTilesResult>; at: number }>();
  private readonly tiles = new Map<string, CachedTile>();
  private active = 0;
  private readonly waiting: { start: () => void; signal?: AbortSignal }[] = [];

  /**
   * @param api The API client.
   * @param now The clock, for the caches.
   */
  constructor(
    private readonly api: ForesignalClient,
    private readonly now: () => number = Date.now,
  ) {}

  /** A layer's TileJSON, read once and shared; a failed read is tried again after a while. */
  layerTiles(layer: string): Promise<LayerTilesResult> {
    const cached = this.tileJson.get(layer);
    if (cached) {
      const stale = this.now() - cached.at > TILE_JSON_RETRY_MS;
      if (!stale) return cached.result;
      // Only a failure is read again; a template that loaded stays.
      const retry = cached.result.then((result) => (result.ok ? result : this.readTileJson(layer)));
      this.tileJson.set(layer, { result: retry, at: this.now() });
      return retry;
    }
    return this.readTileJson(layer);
  }

  /**
   * One tile of a layer: from the cache while it is fresh, else fetched (waiting for a free slot
   * in the shared queue) and decoded. Only tiles that loaded are kept. Throws only when `signal`
   * aborts.
   */
  async tile(
    template: RecordTileTemplate,
    tile: TileId,
    signal: AbortSignal,
    agg?: TileAggregation,
  ): Promise<TileResult> {
    const key = cacheKey(template, tile, agg);
    const cached = this.tiles.get(key);
    if (cached && this.now() - cached.at <= TILE_CACHE_MS) {
      // Most recently used last, so the oldest are evicted first.
      this.tiles.delete(key);
      this.tiles.set(key, cached);
      return { status: 'ok', features: cached.features };
    }
    await this.slot(signal);
    try {
      const result = await fetchTile(this.api, template, tile, signal, agg);
      if (result.status === 'ok') this.keep(key, result.features);
      return result;
    } finally {
      this.release();
    }
  }

  /** Requests waiting for a slot, and in flight (for tests and the stress harness). */
  get queued(): { waiting: number; active: number } {
    return { waiting: this.waiting.length, active: this.active };
  }

  private readTileJson(layer: string): Promise<LayerTilesResult> {
    const read = async (): Promise<LayerTilesResult> => {
      await this.slot(NEVER_ABORTED);
      try {
        return await loadLayerTiles(this.api, layer);
      } catch (cause) {
        return {
          ok: false,
          message: cause instanceof Error ? cause.message : 'The layer’s TileJSON did not load.',
          transient: true,
        };
      } finally {
        this.release();
      }
    };
    const result: Promise<LayerTilesResult> = read().then((loaded) => {
      // A transient failure is not kept: the next ask reads again.
      if (!loaded.ok && loaded.transient && this.tileJson.get(layer)?.result === result) {
        this.tileJson.delete(layer);
      }
      return loaded;
    });
    this.tileJson.set(layer, { result, at: this.now() });
    return result;
  }

  private keep(key: string, features: RecordFeature[]): void {
    this.tiles.delete(key);
    this.tiles.set(key, { features, at: this.now() });
    while (this.tiles.size > TILE_CACHE_SIZE) {
      this.tiles.delete(this.tiles.keys().next().value!);
    }
  }

  /** Waits for a free request slot; rejects if `signal` aborts first. */
  private slot(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.active < MAX_TILE_REQUESTS) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const entry = {
        signal,
        start: () => {
          signal.removeEventListener('abort', onAbort);
          this.active++;
          resolve();
        },
      };
      const onAbort = () => {
        const index = this.waiting.indexOf(entry);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(entry);
    });
  }

  /** Frees a slot and starts the next waiting request. */
  private release(): void {
    this.active--;
    this.waiting.shift()?.start();
  }
}

/** A signal that never aborts, for requests no view makes stale (TileJSON). */
const NEVER_ABORTED = new AbortController().signal;

/** The cache key of a tile: its layer, query, aggregation and position. */
function cacheKey(template: RecordTileTemplate, tile: TileId, agg?: TileAggregation): string {
  return `${template.layer}|${JSON.stringify(template.query)}|${agg ?? ''}|${tileKey(tile)}`;
}
