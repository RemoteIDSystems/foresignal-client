/**
 * The one clock the app formats instants against. Every user-facing timestamp flows through the
 * formatters here, so a user's chosen timezone and locale (R2-007, `UserPreferences`) apply across
 * the whole app from a single place rather than from a formatter copied per view.
 *
 * The default clock — no chosen timezone, no chosen locale — reproduces the project's long-standing
 * UTC rendering exactly (`2025-09-18 14:32Z`), so every existing call site is unchanged until a
 * signed-in user picks a zone.
 */

/** The applied clock: the zone and locale timestamps are rendered in. */
export interface Clock {
  /** IANA zone (e.g. `Europe/Paris`), or `null` for UTC — the server/default behavior. */
  timezone: string | null;
  /** BCP 47 locale (e.g. `en-GB`), or `null` for the project default (`en-US`). */
  locale: string | null;
}

const DEFAULT_CLOCK: Clock = { timezone: null, locale: null };

let clock: Clock = DEFAULT_CLOCK;

/** The locale the clock formats with (the chosen one, else the project default). */
function activeLocale(): string {
  return clock.locale ?? 'en-US';
}

/**
 * Sets the applied clock. Called from the app root as the user's preferences change, so the next
 * render of any timestamp uses the new zone and locale. Idempotent: setting the same values twice
 * (e.g. under React StrictMode's double render) is harmless.
 */
export function setClock(next: Clock): void {
  clock = { timezone: next.timezone ?? null, locale: next.locale ?? null };
}

/** Resets the clock to its default (UTC, `en-US`); for tests and sign-out. */
export function resetClock(): void {
  clock = DEFAULT_CLOCK;
}

/** The applied clock. */
export function getClock(): Clock {
  return clock;
}

/** Two-digit padding for the UTC default path. */
function utc(iso: string): Date | null {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * An instant as a minute-precision timestamp. With no chosen zone this is the project's UTC form
 * (`2025-09-18 14:32Z`); with a chosen zone it is that wall-clock time with the zone's short name
 * (`2025-09-18 16:32 GMT+2`), formatted in the chosen (or default) locale.
 */
export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = utc(iso);
  if (!at) return '—';
  if (!clock.timezone) return `${at.toISOString().slice(0, 16).replace('T', ' ')}Z`;
  const parts = new Intl.DateTimeFormat(activeLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: clock.timezone,
    timeZoneName: 'short',
  }).formatToParts(at);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  // hour can render as "24" at midnight under hour12:false; normalize to "00".
  const hour = find('hour') === '24' ? '00' : find('hour');
  return `${find('year')}-${find('month')}-${find('day')} ${hour}:${find('minute')} ${find('timeZoneName')}`;
}

/**
 * An instant as a short day label. With no chosen zone this is the timeline's UTC form (`SEP 18`);
 * with a chosen zone it is that zone's day, in the chosen (or default) locale.
 */
export function formatDay(iso: string): string {
  const at = utc(iso);
  if (!at) return '';
  return at
    .toLocaleDateString(activeLocale(), {
      month: 'short',
      day: '2-digit',
      timeZone: clock.timezone ?? 'UTC',
    })
    .toUpperCase();
}
