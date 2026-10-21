import { rowKeys, type ProductEntry } from '../map/products/productCatalog';
import type { CategoryGroup } from '../map/records/catalog';
import {
  CATEGORY_KEYS,
  categoryToggle,
  globalShortcuts,
  otherScene,
  toggleClosed,
  type GlobalShortcutActions,
} from './globalShortcuts';

/** A rail category with the given kinds. */
function group(id: CategoryGroup['id'], label: string, kinds: string[]): CategoryGroup {
  return {
    id,
    label,
    count: 0,
    kinds: kinds.map((kind) => ({ id: kind, label: kind, category: id, sources: [], count: 0 })),
  };
}

/** A curated weather product the Weather checkbox covers. */
const RADAR: ProductEntry = {
  id: 'mrms-reflectivity',
  label: 'MRMS Reflectivity',
  productCategory: 'radar',
  category: 'weather',
  field: false,
  available: true,
};

/** Actions that record what they were asked. */
function actions(categories: CategoryGroup[]): GlobalShortcutActions & {
  toggled: string[];
  panels: string[];
} {
  const toggled: string[] = [];
  const panels: string[] = [];
  return {
    categories,
    toggled,
    panels,
    toggleCategory: (entry) => toggled.push(entry.id),
    toggleScene: vi.fn(),
    togglePanel: (id) => panels.push(id),
  };
}

describe('categoryToggle', () => {
  it('turns a category on when any of its kinds or curated products is off', () => {
    const weather = group('weather', 'Weather', ['storm']);
    const result = categoryToggle(weather, new Set(['storm']), [RADAR], new Set());
    expect(result).toEqual({ kinds: ['storm'], productKeys: rowKeys(RADAR), on: true });
  });

  it('turns it off when all of them are on, as the rail checkbox does', () => {
    const weather = group('weather', 'Weather', ['storm']);
    const result = categoryToggle(weather, new Set(['storm']), [RADAR], new Set(rowKeys(RADAR)));
    expect(result.on).toBe(false);
  });

  it('covers only the kinds of a category without products', () => {
    const events = group('events', 'Events', ['earthquake']);
    expect(categoryToggle(events, new Set(), [RADAR], new Set())).toEqual({
      kinds: ['earthquake'],
      productKeys: [],
      on: true,
    });
  });
});

describe('toggleClosed and otherScene', () => {
  it('closes an open panel and opens a closed one, sorted', () => {
    expect(toggleClosed(['related'], 'layers')).toEqual(['layers', 'related']);
    expect(toggleClosed(['layers', 'related'], 'layers')).toEqual(['related']);
  });

  it('switches 2D to 3D and back', () => {
    expect(otherScene('2d')).toBe('3d');
    expect(otherScene('3d')).toBe('2d');
  });
});

describe('globalShortcuts', () => {
  it('numbers the rail categories 1 to 9 in its order and leaves the rest without a key', () => {
    const categories = Array.from({ length: 11 }, (_, index) =>
      group('other', `Category ${index + 1}`, [`kind-${index}`]),
    ).map((entry, index) => ({ ...entry, id: `c${index}` as CategoryGroup['id'] }));
    const list = globalShortcuts(actions(categories));
    const numbered = list.filter((entry) => entry.group === 'Layers');
    expect(numbered).toHaveLength(CATEGORY_KEYS);
    expect(numbered.map((entry) => entry.key)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
    expect(numbered[0]!.description).toBe('Turn Category 1 on or off');
  });

  it('runs each key against its action', () => {
    const events = group('events', 'Events', ['earthquake']);
    const recorded = actions([events]);
    const fly = vi.fn();
    const list = globalShortcuts({ ...recorded, flyToSelection: fly });
    const run = (key: string) => list.find((entry) => entry.key === key)?.run?.();
    run('1');
    run('m');
    run('f');
    run('l');
    run('i');
    expect(recorded.toggled).toEqual(['events']);
    expect(recorded.toggleScene).toHaveBeenCalledOnce();
    expect(fly).toHaveBeenCalledOnce();
    expect(recorded.panels).toEqual(['layers', 'selected-entity']);
  });

  it('lists Esc for clearing the selection without running it (the map handles the key)', () => {
    const esc = globalShortcuts(actions([])).find((entry) => entry.key === 'Escape');
    expect(esc).toMatchObject({ label: 'Esc', group: 'Map' });
    expect(esc?.run).toBeUndefined();
  });

  it('does nothing on f with nothing selected', () => {
    const list = globalShortcuts(actions([]));
    expect(() => list.find((entry) => entry.key === 'f')?.run?.()).not.toThrow();
  });
});
