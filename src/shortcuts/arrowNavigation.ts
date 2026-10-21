import { useCallback, type KeyboardEvent } from 'react';

/** The keys that move focus along a rail: up and down one item, Home and End to its ends. */
const MOVES = ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const;

/**
 * The item a key moves focus to in a list of items (036): the next or previous one (stopping at
 * the ends), or the first or last. Disabled items are skipped. Undefined when the key is not a
 * move or there is nowhere to go.
 */
export function nextItem<T extends { disabled?: boolean }>(
  items: readonly T[],
  current: T | undefined,
  key: string,
): T | undefined {
  const usable = items.filter((item) => !item.disabled);
  if (usable.length === 0) return undefined;
  if (key === 'Home') return usable[0];
  if (key === 'End') return usable[usable.length - 1];
  const index = current ? usable.indexOf(current) : -1;
  if (key === 'ArrowDown') return usable[Math.min(index + 1, usable.length - 1)];
  if (key === 'ArrowUp') return index < 0 ? usable[0] : usable[Math.max(index - 1, 0)];
  return undefined;
}

/**
 * A keydown handler for a rail (036): the arrow keys, Home and End move focus among the
 * container's items matching `selector`, so a keyboard user walks the rail without tabbing
 * through every control in it. Tab still leaves the rail as usual.
 */
export function useArrowNavigation(selector: string): (event: KeyboardEvent<HTMLElement>) => void {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!(MOVES as readonly string[]).includes(event.key)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)];
      const current = items.find(
        (item) => item === event.target || item.contains(event.target as Node),
      );
      if (!current) return;
      const asItems = items.map((element) => ({
        element,
        disabled: element.matches(':disabled'),
      }));
      const next = nextItem(
        asItems,
        asItems.find((item) => item.element === current),
        event.key,
      );
      if (!next) return;
      event.preventDefault();
      next.element.focus();
    },
    [selector],
  );
}
