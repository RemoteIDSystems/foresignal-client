import { createTokenStore, TOKEN_STORAGE_KEY } from './auth';

beforeEach(() => localStorage.clear());

describe('createTokenStore', () => {
  it('starts empty when nothing is stored', () => {
    expect(createTokenStore().get()).toBeNull();
  });

  it('persists a set token, trimmed, and restores it in a new store', () => {
    createTokenStore().set('  fsr_abc  ');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('fsr_abc');
    expect(createTokenStore().get()).toBe('fsr_abc');
  });

  it('clears the token, including a blank set', () => {
    const store = createTokenStore();
    store.set('fsr_abc');
    store.set('   ');
    expect(store.get()).toBeNull();
    store.set('fsr_abc');
    store.clear();
    expect(store.get()).toBeNull();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('notifies subscribers on change only', () => {
    const store = createTokenStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set('fsr_abc');
    store.set('fsr_abc');
    store.clear();
    unsubscribe();
    store.set('fsr_def');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
