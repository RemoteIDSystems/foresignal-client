import { useEffect, useSyncExternalStore } from 'react';

/** The overlay's groups, in the order it lists them. */
export const SHORTCUT_GROUPS = ['General', 'Map', 'Layers', 'Time', 'Panels'] as const;

/** A group of shortcuts in the overlay. */
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

/** One keyboard shortcut: the key it answers, how the overlay shows it, and what it does. */
export interface Shortcut {
  /** Unique among the shortcuts registered at once. */
  id: string;
  /** The `KeyboardEvent.key` it answers (`?`, `/`, `m`, `1`, `[`, `Escape`). */
  key: string;
  /** How the overlay writes the key, when not the key itself (`Esc`). */
  label?: string;
  /** What it does, in the overlay. */
  description: string;
  group: ShortcutGroup;
  /** What it does; without one it is listed only (a key another control handles itself). */
  run?: () => void;
}

/** Whether a key event comes from somewhere the person is typing, where letters are text. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(
    type,
  );
}

/** Whether an element is drawn: not hidden, nor inside anything hidden or `display: none`. */
function shown(element: Element): boolean {
  if (typeof element.checkVisibility === 'function') return element.checkVisibility();
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || getComputedStyle(node).display === 'none') return false;
  }
  return true;
}

/**
 * Whether a modal dialog is open. Only a shown one counts: the map keeps its own attribution
 * dialog (`aria-modal`) in the page, hidden, at all times.
 */
function dialogShown(): boolean {
  if (typeof document === 'undefined') return false;
  return [...document.querySelectorAll('[aria-modal="true"]')].some(shown);
}

/**
 * The keyboard shortcuts registered now, by the screens and controls that carry them out. Every
 * view registers its own while it is shown (the Global map its layers, scene and panels; the time
 * HUD its scrub keys; the search box `/`), so the overlay always lists what works where the person
 * is. One window listener ({@link useShortcutListener}) hands key presses here.
 */
export class ShortcutRegistry {
  private entries: Shortcut[][] = [];
  private snapshot: readonly Shortcut[] = [];
  private readonly listeners = new Set<() => void>();

  /** Adds shortcuts; returns the function that removes them again. */
  register(shortcuts: readonly Shortcut[]): () => void {
    const entry = [...shortcuts];
    this.entries.push(entry);
    this.changed();
    return () => {
      this.entries = this.entries.filter((candidate) => candidate !== entry);
      this.changed();
    };
  }

  /** The shortcuts registered now, newest registration last (a new list after each change). */
  list = (): readonly Shortcut[] => this.snapshot;

  /** Subscribes to changes; returns the unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Carries out the shortcut a key press names, if any, and says whether one ran. Presses with
   * Ctrl, Alt or Meta, presses while typing, and presses while a dialog is open are left alone
   * (the dialog has its own keys), and the newest registration of a key wins.
   */
  handle(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'target'>): boolean {
    if (event.ctrlKey || event.altKey || event.metaKey) return false;
    if (isTyping(event.target)) return false;
    if (dialogShown()) return false;
    for (let index = this.snapshot.length - 1; index >= 0; index--) {
      const shortcut = this.snapshot[index]!;
      if (shortcut.key === event.key && shortcut.run) {
        shortcut.run();
        return true;
      }
    }
    return false;
  }

  private changed() {
    this.snapshot = this.entries.flat();
    for (const listener of this.listeners) listener();
  }
}

/** The app's shortcuts. */
export const shortcuts = new ShortcutRegistry();

/**
 * Registers shortcuts while the component is shown. Pass a memoized list: a new list registers
 * again.
 */
export function useShortcuts(
  list: readonly Shortcut[],
  registry: ShortcutRegistry = shortcuts,
): void {
  useEffect(() => registry.register(list), [list, registry]);
}

/** The shortcuts registered now, re-rendering on change. */
export function useShortcutList(registry: ShortcutRegistry = shortcuts): readonly Shortcut[] {
  return useSyncExternalStore(registry.subscribe, registry.list);
}

/** Hands the window's key presses to the registry while the component is shown (the app shell). */
export function useShortcutListener(registry: ShortcutRegistry = shortcuts): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (registry.handle(event)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registry]);
}

/** A shortcut list grouped for the overlay, in {@link SHORTCUT_GROUPS} order, each key once. */
export function groupShortcuts(
  list: readonly Shortcut[],
): { group: ShortcutGroup; shortcuts: Shortcut[] }[] {
  const seen = new Set<string>();
  const newestFirst = [...list].reverse().filter((shortcut) => {
    if (seen.has(shortcut.key)) return false;
    seen.add(shortcut.key);
    return true;
  });
  return SHORTCUT_GROUPS.map((group) => ({
    group,
    shortcuts: newestFirst.filter((shortcut) => shortcut.group === group).reverse(),
  })).filter((entry) => entry.shortcuts.length > 0);
}
