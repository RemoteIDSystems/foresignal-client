import { markOnboarded, ONBOARDED_KEY, onboarded, WELCOME_STEPS } from './onboarding';

/** A storage stand-in that can refuse. */
function storage(refuse = false) {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => {
      if (refuse) throw new Error('refused');
      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (refuse) throw new Error('refused');
      values.set(key, value);
    },
    removeItem: (key: string) => values.delete(key),
  };
}

describe('onboarding', () => {
  it('is not onboarded until marked, then is', () => {
    const local = storage();
    expect(onboarded(local)).toBe(false);
    markOnboarded(local);
    expect(onboarded(local)).toBe(true);
    expect(local.getItem(ONBOARDED_KEY)).toBe('1');
  });

  it('treats storage that refuses as not onboarded, without throwing', () => {
    const local = storage(true);
    expect(() => markOnboarded(local)).not.toThrow();
    expect(onboarded(local)).toBe(false);
    expect(onboarded(undefined)).toBe(false);
  });

  it('names the keys the shortcuts use', () => {
    const text = WELCOME_STEPS.map((step) => step.text).join(' ');
    expect(text).toContain('press M');
    expect(text).toContain('Press /');
    expect(text).toContain('? for every keyboard shortcut');
  });
});
