import {
  createSessionStore,
  createTokenStore,
  SESSION_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
} from './auth';

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

describe('createSessionStore', () => {
  it('starts signed out when nothing is stored', () => {
    expect(createSessionStore().get()).toBeNull();
  });

  it('persists a session credential as JSON and restores it in a new store', () => {
    createSessionStore().set({ token: 'fss_live', expiresAt: '2026-10-30T00:00:00Z' });
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}')).toEqual({
      token: 'fss_live',
      expiresAt: '2026-10-30T00:00:00Z',
    });
    expect(createSessionStore().get()).toEqual({
      token: 'fss_live',
      expiresAt: '2026-10-30T00:00:00Z',
    });
  });

  it('treats a malformed stored value as signed out', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, 'not json');
    expect(createSessionStore().get()).toBeNull();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ noToken: true }));
    expect(createSessionStore().get()).toBeNull();
  });

  it('clears the session and its stored value', () => {
    const store = createSessionStore();
    store.set({ token: 'fss_live' });
    store.clear();
    expect(store.get()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('notifies subscribers on every set and clear', () => {
    const store = createSessionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set({ token: 'fss_one' });
    store.set({ token: 'fss_two' });
    store.clear();
    unsubscribe();
    store.set({ token: 'fss_three' });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
