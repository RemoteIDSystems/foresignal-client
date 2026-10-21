import { categoryDefaultKeys, type ProductEntry } from '../map/products/productCatalog';
import type { CategoryGroup } from '../map/records/catalog';
import type { SceneModeKey } from '../map/sceneMode';
import type { Shortcut } from './shortcuts';

/** The categories the number keys reach: `1` the rail's first, up to `9`. */
export const CATEGORY_KEYS = 9;

/**
 * What a category's number key does (036): the same as its rail checkbox. When every kind and
 * curated product of the category is on, it turns them off; otherwise it turns them all on.
 */
export function categoryToggle(
  group: CategoryGroup,
  enabled: ReadonlySet<string>,
  entries: readonly ProductEntry[],
  enabledProducts: ReadonlySet<string>,
): { kinds: string[]; productKeys: string[]; on: boolean } {
  const kinds = group.kinds.map((entry) => entry.id);
  const productKeys = categoryDefaultKeys(entries, group.id);
  const all =
    kinds.every((id) => enabled.has(id)) && productKeys.every((key) => enabledProducts.has(key));
  return { kinds, productKeys, on: !all };
}

/** The closed panel ids, sorted, after `id` is opened (when closed) or closed (when open). */
export function toggleClosed(closed: readonly string[], id: string): string[] {
  const next = new Set(closed);
  if (!next.delete(id)) next.add(id);
  return [...next].sort();
}

/** The other map mode. */
export function otherScene(mode: SceneModeKey): SceneModeKey {
  return mode === '2d' ? '3d' : '2d';
}

/** What the Global map's shortcuts act on. */
export interface GlobalShortcutActions {
  /** The rail's categories, in its order. */
  categories: readonly CategoryGroup[];
  /** Turns a category's kinds and curated products on or off, as its rail checkbox does. */
  toggleCategory: (group: CategoryGroup) => void;
  /** Switches between the 2D map and the 3D globe. */
  toggleScene: () => void;
  /** Opens or closes a dock panel by id. */
  togglePanel: (id: string) => void;
  /** Flies to the selected object; undefined when nothing with a place is selected. */
  flyToSelection?: () => void;
}

/**
 * The Global map's shortcuts (036): `1`–`9` the rail's categories, `m` the map mode, `f` the
 * selection, `l` and `i` the layers and selected-entity panels, and `Esc` listed for clearing the
 * selection (the map handles that key itself).
 */
export function globalShortcuts(actions: GlobalShortcutActions): Shortcut[] {
  const list: Shortcut[] = actions.categories.slice(0, CATEGORY_KEYS).map((group, index) => ({
    id: `category-${group.id}`,
    key: String(index + 1),
    description: `Turn ${group.label} on or off`,
    group: 'Layers',
    run: () => actions.toggleCategory(group),
  }));
  list.push(
    {
      id: 'scene',
      key: 'm',
      label: 'M',
      description: 'Switch between 2D Map and 3D Globe',
      group: 'Map',
      run: actions.toggleScene,
    },
    {
      id: 'fly-to-selection',
      key: 'f',
      label: 'F',
      description: 'Fly to the selected object',
      group: 'Map',
      run: () => actions.flyToSelection?.(),
    },
    {
      id: 'clear-selection',
      key: 'Escape',
      label: 'Esc',
      description: 'Clear the selection',
      group: 'Map',
    },
    {
      id: 'panel-layers',
      key: 'l',
      label: 'L',
      description: 'Show or hide the Layers panel',
      group: 'Panels',
      run: () => actions.togglePanel('layers'),
    },
    {
      id: 'panel-selected-entity',
      key: 'i',
      label: 'I',
      description: 'Show or hide the Selected Entity panel',
      group: 'Panels',
      run: () => actions.togglePanel('selected-entity'),
    },
  );
  return list;
}
