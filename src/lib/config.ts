/** Runtime configuration for the ForeSignal Client. */

/** The base URL used when `VITE_FORESIGNAL_BASE_URL` is unset or blank: same-origin. */
export const DEFAULT_BASE_URL = '/';

/**
 * Resolves the backend base URL from a raw environment value.
 *
 * A missing or blank value falls back to {@link DEFAULT_BASE_URL}, which keeps requests
 * same-origin with the page — the production layout, where the backend serves this build.
 */
export function resolveBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : DEFAULT_BASE_URL;
}

/** The backend base URL for this build, read from `VITE_FORESIGNAL_BASE_URL`. */
export const baseUrl: string = resolveBaseUrl(import.meta.env.VITE_FORESIGNAL_BASE_URL);
