import type { components } from '../../api/generated/schema';

/** One structured attribution (`getAttributions`). */
export type Attribution = components['schemas']['Attribution'];

/**
 * The attributions the map must show: those whose license requires display (`requiredDisplay`),
 * one per distinct text. An entry without the field is not shown: the spec makes it required, so
 * its absence says nothing about the license.
 */
export function requiredAttributions(attributions: readonly Attribution[]): Attribution[] {
  const seen = new Set<string>();
  return attributions.filter((item) => {
    if (item.requiredDisplay !== true || seen.has(item.text)) return false;
    seen.add(item.text);
    return true;
  });
}

/**
 * Every attribution for the credits page, whatever `requiredDisplay` says: one per distinct text
 * and license, sorted by text. Nothing a source asks to be credited for is left out.
 */
export function creditList(attributions: readonly Attribution[]): Attribution[] {
  const seen = new Set<string>();
  return attributions
    .filter((item) => {
      const key = `${item.text}\u0000${item.licence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.text.localeCompare(b.text, 'en', { sensitivity: 'base' }));
}

/** The link an attribution offers: its own URL, else its terms, else its license page. */
export function attributionHref(item: Attribution): string | undefined {
  return item.url ?? item.termsUrl ?? item.licenceUrl ?? undefined;
}
