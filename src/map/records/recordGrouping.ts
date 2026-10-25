import { readStored, writeStored } from '../../lib/storage';

/**
 * How the map draws dense point layers zoomed out: as hexagon cells counting the records in them
 * (the backend's `agg=hex` tiles below a layer's `aggBelowZoom`, and the client's cells of 037), or
 * as every record on its own at every zoom.
 */
export type RecordGrouping = 'hexagons' | 'individual';

/** The grouping a browser starts with: the hexagon cells. */
export const DEFAULT_RECORD_GROUPING: RecordGrouping = 'hexagons';

/** The browser storage key the grouping is remembered under. */
export const RECORD_GROUPING_KEY = 'foresignal.recordGrouping';

type Listener = () => void;

/** Whether `value` names a {@link RecordGrouping}. */
export function isRecordGrouping(value: unknown): value is RecordGrouping {
  return value === 'hexagons' || value === 'individual';
}

/** The grouping this browser last picked, else {@link DEFAULT_RECORD_GROUPING}. */
export function readRecordGrouping(): RecordGrouping {
  const stored = readStored(RECORD_GROUPING_KEY);
  return isRecordGrouping(stored) ? stored : DEFAULT_RECORD_GROUPING;
}

/**
 * The grouping picked, shared by every map in the page and remembered in this browser: read once
 * from storage, written back on each change.
 */
export interface RecordGroupingStore {
  get(): RecordGrouping;
  set(grouping: RecordGrouping): void;
  subscribe(listener: Listener): () => void;
}

/** A {@link RecordGroupingStore} starting from what this browser remembers. */
export function createRecordGroupingStore(
  initial: RecordGrouping = readRecordGrouping(),
): RecordGroupingStore {
  let current = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => current,
    set(grouping) {
      if (grouping === current) return;
      current = grouping;
      writeStored(RECORD_GROUPING_KEY, grouping);
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The page's grouping choice. */
export const recordGroupingStore: RecordGroupingStore = createRecordGroupingStore();
