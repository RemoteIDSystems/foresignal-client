/**
 * Safe access to `localStorage`.
 *
 * Storage can be missing or throw (private windows, blocked site data, tests). Every helper
 * degrades to "nothing stored" rather than failing the caller.
 */

/** Reads a stored string, or `null` when absent or unavailable. */
export function readStored(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Stores a string, or removes the key when `value` is `null`. Failures are ignored. */
export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) {
      globalThis.localStorage?.removeItem(key);
    } else {
      globalThis.localStorage?.setItem(key, value);
    }
  } catch {
    // Storage unavailable: the value lives only for this page load.
  }
}
