import type { PropertyValue, RecordFeature } from './decodeTile';

/**
 * A record's identity across tiles: its source and its id there. Undefined when the tile does not
 * carry both, in which case the record cannot be matched and is always drawn.
 */
export function recordId(properties: Record<string, PropertyValue>): string | undefined {
  const { source, externalId } = properties;
  if (typeof source !== 'string' || externalId === undefined) return;
  return `${source}\u0000${String(externalId)}`;
}

/**
 * The records the FILTERS tab lets through: those whose `source` is not hidden. A record that
 * names no source is kept: there is nothing to filter it by.
 */
export function shownRecords(
  features: readonly RecordFeature[],
  hiddenSources: ReadonlySet<string>,
): RecordFeature[] {
  if (hiddenSources.size === 0) return [...features];
  return features.filter((feature) => {
    const source = feature.properties.source;
    return typeof source !== 'string' || !hiddenSources.has(source);
  });
}

/**
 * Which drawn tile holds each point record, so a record that two tiles of one zoom both carry is
 * drawn once. A point lies in one tile, so this is a safety, not the normal case; lines and
 * polygons are cut at tile edges into pieces that share an id, and are never claimed. Claims are
 * per tile zoom: while the map changes zoom, the old zoom's tiles stay drawn until the new ones
 * are in, and the new tiles must draw their records rather than defer to tiles about to go. A tile
 * that was refused a record is remembered, so it can draw the record once the holder goes.
 */
export class RecordClaims {
  private readonly owners = new Map<string, string>();
  /** Tiles refused a record, by the claim key they wait on. */
  private readonly waiting = new Map<string, Set<string>>();

  /**
   * Claims a record for a tile (`z/x/y`, optionally prefixed); false when another tile of the same
   * zoom holds it already.
   */
  claim(id: string, tile: string): boolean {
    const key = `${zoomOf(tile)}|${id}`;
    const owner = this.owners.get(key);
    if (owner !== undefined && owner !== tile) {
      let tiles = this.waiting.get(key);
      if (!tiles) this.waiting.set(key, (tiles = new Set()));
      tiles.add(tile);
      return false;
    }
    this.owners.set(key, tile);
    return true;
  }

  /**
   * Releases every record a tile holds, when the tile is removed or redrawn, and forgets that it
   * waits on any. Returns the other tiles that were refused one of those records, which should be
   * drawn again to take them.
   */
  release(tile: string): string[] {
    const redraw = new Set<string>();
    for (const [key, owner] of this.owners) {
      if (owner !== tile) continue;
      this.owners.delete(key);
      for (const waiter of this.waiting.get(key) ?? []) if (waiter !== tile) redraw.add(waiter);
      this.waiting.delete(key);
    }
    for (const [key, tiles] of this.waiting) {
      tiles.delete(tile);
      if (tiles.size === 0) this.waiting.delete(key);
    }
    return [...redraw];
  }

  /** Records held now. */
  get size(): number {
    return this.owners.size;
  }
}

/** The zoom of a tile key (`z/x/y`, perhaps after a prefix such as `hex:`). */
function zoomOf(tile: string): string {
  return tile.slice(tile.lastIndexOf(':') + 1).split('/')[0] ?? '';
}
