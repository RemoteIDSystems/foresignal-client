import type { components } from '../api/generated/schema';
import type { PropertyValue, RecordFeature } from '../map/records/decodeTile';

/** One entity in a history frame (`FrameItem`). */
export type FrameItem = components['schemas']['FrameItem'];

/** The backend's keyframe and delta frames for a span (`HistoryFrames`). */
export type HistoryFrames = components['schemas']['HistoryFrames'];

/**
 * A history playback: the backend's keyframe and delta frames for a span (`getHistoryFrames`),
 * replayed in order. Step 0 is the keyframe, the world as it was at the span's start (`asOf`);
 * step `i` is the keyframe with frames 1…i applied, which the backend defines as the world as of
 * the i-th frame's time. States are built forward once and kept, so stepping back is as cheap as
 * stepping on.
 */
export class HistoryPlayback {
  private readonly states: Map<string, FrameItem>[] = [];

  /** @param frames The backend's response. */
  constructor(readonly frames: HistoryFrames) {
    this.states.push(new Map(frames.keyframe.map((item) => [item.id, item])));
  }

  /** How many steps there are: the keyframe and each frame. */
  get length(): number {
    return this.frames.frames.length + 1;
  }

  /** The instant step `index` shows. */
  timeAt(index: number): string {
    const i = this.clamp(index);
    return i === 0 ? this.frames.asOf : this.frames.frames[i - 1]!.t;
  }

  /** The step showing the latest state at or before `at` (epoch ms). */
  indexAt(at: number): number {
    let index = 0;
    for (let i = 1; i < this.length; i++) {
      if (Date.parse(this.timeAt(i)) <= at) index = i;
      else break;
    }
    return index;
  }

  /** True when the backend says the frames were derived approximately (downsampled history). */
  get approximate(): boolean {
    return this.frames.approximate === true;
  }

  /** The entities as of step `index`: the keyframe with frames 1…index applied. */
  stateAt(index: number): FrameItem[] {
    const i = this.clamp(index);
    while (this.states.length <= i) {
      const next = new Map(this.states[this.states.length - 1]);
      const frame = this.frames.frames[this.states.length - 1]!;
      for (const removal of frame.removals) next.delete(removal.id);
      for (const item of frame.upserts) next.set(item.id, item);
      this.states.push(next);
    }
    return [...this.states[i]!.values()];
  }

  private clamp(index: number): number {
    return Math.min(this.length - 1, Math.max(0, Math.round(index)));
  }
}

/**
 * A frame entity as the record layers draw it: a point at its position, with its tile properties
 * and the `source`, `externalId`, `kind` and `title` a tile's records carry, so it takes the same
 * symbol from the overlay style and picks as the same record. Undefined for an entity with no
 * position.
 */
export function frameFeature(item: FrameItem): RecordFeature | undefined {
  if (item.lon == null || item.lat == null) return undefined;
  const split = item.id.indexOf(':');
  const source = split > 0 ? item.id.slice(0, split) : item.id;
  const externalId = split > 0 ? item.id.slice(split + 1) : item.id;
  const properties: Record<string, PropertyValue> = {};
  for (const [key, value] of Object.entries(item.props ?? {})) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      properties[key] = value;
    }
  }
  Object.assign(properties, { source, externalId, kind: item.kind });
  if (item.title) properties.title = item.title;
  return { layer: source, properties, geometry: { type: 'point', points: [[item.lon, item.lat]] } };
}
