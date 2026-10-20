// @vitest-environment node
import liveKinds from './fixtures/live-kinds.json';
import { categoryOf, DEFAULT_CATEGORIES, KIND_CATEGORIES, OTHER_CATEGORY } from './kindCategories';

/** The kinds `listTileLayers` served on 2026-10-19, all 190 of them. */
const kinds = liveKinds as string[];

/** Kinds that belong to none of the mock's categories, deliberately. */
const DELIBERATELY_OTHER = ['bird-sighting', 'nature-observation', 'park-boundary'];

describe('kind categories', () => {
  it('lists the Global mock’s twelve categories in its order, then Other', () => {
    expect(KIND_CATEGORIES.map((category) => category.label)).toEqual([
      'Events',
      'Aircraft (ADS-B)',
      'Maritime (AIS)',
      'Satellite Orbits',
      'Weather',
      'Imagery (Recent)',
      'RF / Spectrum',
      'Infrastructure',
      'Cyber / Network',
      'Energy / Power',
      'Disasters / Hazards',
      'Conflicts / Security',
      'Other',
    ]);
  });

  it('places every live kind, leaving only the deliberate few in Other', () => {
    expect(kinds).toHaveLength(190);
    expect(kinds.filter((kind) => categoryOf(kind) === OTHER_CATEGORY)).toEqual(DELIBERATELY_OTHER);
  });

  it('gives every category at least one live kind', () => {
    const used = new Set(kinds.map(categoryOf));
    expect(KIND_CATEGORIES.filter((category) => !used.has(category.id))).toEqual([]);
  });

  it('places kinds where their feeds put them', () => {
    expect(categoryOf('earthquake')).toBe('hazards');
    expect(categoryOf('social-post')).toBe('events');
    expect(categoryOf('aircraft')).toBe('aircraft');
    expect(categoryOf('vessel')).toBe('maritime');
    expect(categoryOf('loiter')).toBe('maritime');
    expect(categoryOf('deception')).toBe('rf');
    expect(categoryOf('solar-wind')).toBe('weather');
  });

  it('puts a kind it has never seen in Other', () => {
    expect(categoryOf('a-kind-from-next-year')).toBe(OTHER_CATEGORY);
  });

  it('starts with the categories the mock shows checked', () => {
    expect(DEFAULT_CATEGORIES).toEqual(['events', 'weather', 'infrastructure']);
  });
});
