import { json, standInApi } from '../intel/testing/standIn';
import {
  IDLE_AFTER_MS,
  PRESENCE_BEAT_MS,
  PRESENCE_TTL_SECONDS,
  presenceState,
  startPresence,
  type PresenceDocument,
} from './presence';

/** A page whose visibility and focus the test sets, firing the events a browser would. */
class FakePage implements PresenceDocument {
  visibilityState: DocumentVisibilityState = 'visible';
  focused = true;
  readonly target = new EventTarget();
  hasFocus = () => this.focused;
  addEventListener = (type: string, listener: () => void) =>
    this.target.addEventListener(type, listener);
  removeEventListener = (type: string, listener: () => void) =>
    this.target.removeEventListener(type, listener);
  fire(type: string) {
    this.target.dispatchEvent(new Event(type));
  }
}

describe('presence', () => {
  it('is background when hidden, idle when unfocused or untouched, else active', () => {
    expect(presenceState({ visibilityState: 'hidden', hasFocus: () => true }, 0)).toBe(
      'background',
    );
    expect(presenceState({ visibilityState: 'visible', hasFocus: () => false }, 0)).toBe('idle');
    expect(presenceState({ visibilityState: 'visible', hasFocus: () => true }, IDLE_AFTER_MS)).toBe(
      'idle',
    );
    expect(presenceState({ visibilityState: 'visible', hasFocus: () => true }, 1_000)).toBe(
      'active',
    );
  });

  describe('the heartbeat', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function run(token: string | null = 'token') {
      const stand = standInApi({
        'POST /v1/clients/presence': () =>
          json({ deviceKey: 'd', kind: 'web', state: 'active', expiresAt: '2026-10-20T12:02:00Z' }),
      });
      const page = new FakePage();
      const win = new FakePage();
      const stop = startPresence({ api: stand.api, getToken: () => token, doc: page, win });
      return { ...stand, page, win, stop };
    }

    it('reports at once, on each change, and every beat', async () => {
      const { bodies, page, win, stop } = run();
      await vi.advanceTimersByTimeAsync(0);
      expect(bodies).toEqual([{ kind: 'web', state: 'active', ttlSeconds: PRESENCE_TTL_SECONDS }]);
      page.focused = false;
      win.fire('blur');
      page.visibilityState = 'hidden';
      page.fire('visibilitychange');
      await vi.advanceTimersByTimeAsync(0);
      expect(bodies.map((body) => (body as { state: string }).state)).toEqual([
        'active',
        'idle',
        'background',
      ]);
      await vi.advanceTimersByTimeAsync(PRESENCE_BEAT_MS);
      expect(bodies).toHaveLength(4);
      stop();
      await vi.advanceTimersByTimeAsync(PRESENCE_BEAT_MS);
      expect(bodies).toHaveLength(4);
    });

    it('reports nothing without a token', async () => {
      const { asked, stop } = run(null);
      await vi.advanceTimersByTimeAsync(PRESENCE_BEAT_MS);
      expect(asked).toEqual([]);
      stop();
    });
  });
});
