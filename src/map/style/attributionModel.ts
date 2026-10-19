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
