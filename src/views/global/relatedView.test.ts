// @vitest-environment node
import { MapPin, Siren } from 'lucide-react';
import {
  formatDistance,
  groupOf,
  groupRelated,
  relationText,
  statusLook,
  typeIcon,
  type RelatedObject,
} from './relatedView';

const related = (
  type: RelatedObject['relation']['type'],
  distanceKm?: number,
  label?: RelatedObject['relation']['label'],
): RelatedObject => ({
  relation: { type, ...(label && { label }) } as RelatedObject['relation'],
  direction: 'out',
  object: { ref: `record:x/${type}-${distanceKm}`, type: 'record', title: type },
  ...(distanceKm !== undefined && { distanceKm }),
});

describe('the related classes', () => {
  it('sort each relation into one of the four tabs', () => {
    expect(groupOf(related('near'))).toBe('nearby');
    expect(groupOf(related('located-in'))).toBe('nearby');
    expect(groupOf(related('depends-on'))).toBe('infrastructure');
    expect(groupOf(related('precedes'))).toBe('historical');
    expect(groupOf(related('member-of'))).toBe('operational');
    expect(groupOf(related('related-to'))).toBe('operational');
  });

  it('group a flat list, the nearby ones nearest first', () => {
    const groups = groupRelated([related('near', 45), related('affects'), related('near', 3)]);
    expect(groups.nearby.map((item) => item.distanceKm)).toEqual([3, 45]);
    expect(groups.infrastructure).toHaveLength(1);
    expect(groups.operational).toEqual([]);
    expect(groups.historical).toEqual([]);
  });
});

describe('a related row', () => {
  it('shows its distance, or how it is related', () => {
    expect(formatDistance(45.4)).toBe('45 km');
    expect(formatDistance(1_234)).toBe('1,234 km');
    expect(formatDistance(0.42)).toBe('420 m');
    expect(relationText(related('near', 120))).toBe('120 km');
    expect(relationText(related('depends-on'))).toBe('Depends on');
    expect(relationText(related('causes', undefined, 'likely'))).toBe('Causes (likely)');
    expect(relationText(related('causes', undefined, 'confirmed'))).toBe('Causes');
  });

  it('tones its status and picks its type’s icon', () => {
    expect(statusLook('operational')).toBe('ok');
    expect(statusLook('Underway')).toBe('ok');
    expect(statusLook('Responding')).toBe('warn');
    expect(statusLook('Congestion Alert')).toBe('alert');
    expect(statusLook('active', 'severe')).toBe('alert');
    expect(statusLook('archived')).toBe('none');
    expect(statusLook(null)).toBe('none');
    expect(typeIcon('record')).toBe(MapPin);
    expect(typeIcon('situation')).toBe(Siren);
  });
});
