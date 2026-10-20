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
 * Which drawn tile holds each point record, so a record that two tiles both carry is drawn once.
 * A point lies in one tile, so this is a safety, not the normal case; lines and polygons are cut
 * at tile edges into pieces that share an id, and are never claimed.
 */
export class RecordClaims {
  private readonly owners = new Map<string, string>();

  /** Claims a record for a tile; false when another tile holds it already. */
  claim(id: string, tile: string): boolean {
    const owner = this.owners.get(id);
    if (owner !== undefined && owner !== tile) return false;
    this.owners.set(id, tile);
    return true;
  }

  /** Releases every record a tile holds, when the tile is removed or redrawn. */
  release(tile: string): void {
    for (const [id, owner] of this.owners) if (owner === tile) this.owners.delete(id);
  }

  /** Records held now. */
  get size(): number {
    return this.owners.size;
  }
}
