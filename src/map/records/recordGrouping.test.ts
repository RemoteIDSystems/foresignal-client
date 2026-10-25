import {
  RECORD_GROUPING_KEY,
  createRecordGroupingStore,
  isRecordGrouping,
  readRecordGrouping,
} from './recordGrouping';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the record grouping choice', () => {
  it('names only hexagons and individual', () => {
    expect(isRecordGrouping('hexagons')).toBe(true);
    expect(isRecordGrouping('individual')).toBe(true);
    expect(isRecordGrouping('grid')).toBe(false);
    expect(isRecordGrouping(undefined)).toBe(false);
  });

  it('starts on hexagons, and on what this browser picked before', () => {
    expect(readRecordGrouping()).toBe('hexagons');
    localStorage.setItem(RECORD_GROUPING_KEY, 'individual');
    expect(readRecordGrouping()).toBe('individual');
    localStorage.setItem(RECORD_GROUPING_KEY, 'clusters');
    expect(readRecordGrouping()).toBe('hexagons');
  });

  it('is remembered when picked, and tells its listeners once per change', () => {
    const store = createRecordGroupingStore('hexagons');
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.set('individual');
    store.set('individual');
    expect(store.get()).toBe('individual');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(RECORD_GROUPING_KEY)).toBe('individual');
    expect(createRecordGroupingStore().get()).toBe('individual');
    stop();
    store.set('hexagons');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
