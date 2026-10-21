/** Where this browser remembers that the welcome was dismissed (036). */
export const ONBOARDED_KEY = 'foresignal.onboarded';

/** The storage the welcome is remembered in; `localStorage` by default. */
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The browser's local storage, or undefined where it cannot be reached (a private window). */
function local(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Whether the welcome was dismissed in this browser. Unreadable storage counts as not. */
export function onboarded(storage: StorageLike | undefined = local()): boolean {
  try {
    return storage?.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remembers that the welcome was dismissed; storage that refuses is ignored. */
export function markOnboarded(storage: StorageLike | undefined = local()): void {
  try {
    storage?.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Not remembered: the welcome shows again in the next session.
  }
}

/** The welcome's short steps: the layout rails, the map modes, search and the shortcuts. */
export const WELCOME_STEPS: readonly { title: string; text: string }[] = [
  {
    title: 'Rails and panels',
    text: 'The left rail turns layers and tools on; the right panels show the selected object, imagery and activity.',
  },
  {
    title: '2D Map and 3D Globe',
    text: 'Switch the map between the flat map and the globe from its tabs, or press M.',
  },
  {
    title: 'Search and shortcuts',
    text: 'Press / to search places and objects, and ? for every keyboard shortcut.',
  },
];
