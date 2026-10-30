import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-color-scheme: dark)';

function query(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;
}

function subscribe(listener: () => void): () => void {
  const list = query();
  if (!list) return () => {};
  list.addEventListener('change', listener);
  return () => list.removeEventListener('change', listener);
}

/**
 * Whether the OS asks for a dark color scheme, re-rendering when that changes. Used to resolve the
 * `system` theme choice (R2-007); defaults to `true` (the app's dark default) where `matchMedia`
 * is unavailable.
 */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query()?.matches ?? true,
    () => true,
  );
}
