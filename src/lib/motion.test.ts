import { motionSeconds, prefersReducedMotion } from './motion';

describe('motion', () => {
  it('reads the reduced-motion media query', () => {
    const asked: string[] = [];
    const reduce = (query: string) => {
      asked.push(query);
      return { matches: true };
    };
    expect(prefersReducedMotion(reduce)).toBe(true);
    expect(asked).toEqual(['(prefers-reduced-motion: reduce)']);
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
    expect(prefersReducedMotion(undefined)).toBe(false);
  });

  it('treats a media query that throws as no preference', () => {
    expect(
      prefersReducedMotion(() => {
        throw new Error('unsupported');
      }),
    ).toBe(false);
  });

  it('runs an animation for its time, or not at all with reduced motion', () => {
    expect(motionSeconds(1.5, false)).toBe(1.5);
    expect(motionSeconds(1.5, true)).toBe(0);
  });
});
