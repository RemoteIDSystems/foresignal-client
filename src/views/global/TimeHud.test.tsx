import { act, fireEvent, render, screen } from '@testing-library/react';
import { createForesignalClient } from '../../api/client';
import { createStore, INITIAL_STATE, type AppState } from '../../state/store';
import { PLAYBACK_STEP_MS, TimeHud } from './TimeHud';

/** The fixed instant the HUD's clock reads. */
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const clock = () => NOW;
const HOUR = 3_600_000;

/** What the stand-in backend was asked for, by path. */
let asked: string[] = [];

/** A client whose backend answers the timeline and history frames. */
function api() {
  return createForesignalClient({
    baseUrl: 'http://api.test',
    retry: false,
    fetch: async (request) => {
      const url = new URL(request.url);
      asked.push(`${url.pathname}?${url.searchParams}`);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      if (url.pathname === '/v1/timeline') {
        return json({
          from: '2026-10-19T12:00:00Z',
          to: '2026-10-20T12:00:00Z',
          bucket: '10m',
          timeField: 'observed',
          buckets: [
            { t: '2026-10-20T11:00:00Z', total: 4 },
            { t: '2026-10-20T11:10:00Z', total: 8 },
          ],
          maxBucket: 8,
          approximate: true,
          retainedFrom: '2026-10-19T12:00:00Z',
        });
      }
      if (url.pathname === '/v1/history/frames') {
        const item = (id: string) => ({
          id: `usgs-earthquakes:${id}`,
          kind: 'earthquake',
          observedAt: '2026-10-20T06:00:00Z',
          version: 1,
          lon: 1,
          lat: 2,
        });
        return json({
          asOf: '2026-10-20T06:00:00Z',
          step: '180s',
          watermarkSeq: 9,
          keyframe: [item('a')],
          frames: [
            { t: '2026-10-20T06:03:00Z', upserts: [item('b')], removals: [] },
            { t: '2026-10-20T06:06:00Z', upserts: [item('c')], removals: [] },
          ],
        });
      }
      return new Response(null, { status: 404 });
    },
  });
}

function setup(kinds: readonly string[] = ['earthquake']) {
  const store = createStore<AppState>(INITIAL_STATE);
  render(<TimeHud api={api()} store={store} kinds={kinds} now={clock} />);
  return store;
}

beforeEach(() => {
  asked = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => vi.useRealTimers());

/** Lets the timers run `ms` on, and the requests they start settle. */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
}

describe('TimeHud', () => {
  it('shows live time with the handle at Now, and the drawn kinds’ histogram', async () => {
    setup();
    expect(screen.getByTestId('hud-time')).toHaveTextContent('2026-10-20 12:00:00Z');
    const slider = screen.getByRole('slider', { name: 'Time' });
    expect(slider).toHaveAttribute('data-position', '0.5000');
    expect(slider).toHaveAttribute('aria-valuetext', 'Now (live)');
    expect(screen.getByTestId('live-state')).toBeInTheDocument();
    await advance(600);
    expect(asked[0]).toBe(
      '/v1/timeline?from=2026-10-19T12%3A00%3A00Z&to=2026-10-20T12%3A00%3A00Z&kind=earthquake',
    );
    expect(screen.getByTestId('time-histogram')).toHaveAttribute('data-buckets', '2');
    // The backend said its counts are estimates.
    expect(screen.getByTestId('time-approximate')).toHaveTextContent('Approximate');
  });

  it('pins the map at an instant from the keys, and returns to live', async () => {
    const store = setup();
    const slider = screen.getByRole('slider', { name: 'Time' });
    fireEvent.keyDown(slider, { key: 'PageDown' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(store.get('time')).toEqual({ mode: 'asOf', asOf: '2026-10-20T10:50:00Z' });
    expect(screen.getByTestId('hud-time')).toHaveTextContent('2026-10-20 10:50:00Z');
    expect(screen.getByTestId('time-mode')).toHaveTextContent('HISTORY');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(store.get('time')).toEqual({ mode: 'live' });
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(store.get('time')).toEqual({ mode: 'asOf', asOf: '2026-10-19T12:00:00Z' });
    fireEvent.click(screen.getByRole('button', { name: 'Return to live' }));
    expect(store.get('time')).toEqual({ mode: 'live' });
    // Never in the future: a step right from Now stays live.
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(store.get('time')).toEqual({ mode: 'live' });
  });

  it('pins the instant under the pointer when the handle is dragged and let go', async () => {
    const store = setup();
    const slider = screen.getByRole('slider', { name: 'Time' });
    slider.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 20 }) as DOMRect;
    slider.setPointerCapture = () => {};
    fireEvent.pointerDown(slider, { clientX: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 50, pointerId: 1 });
    // While dragging, the box shows the instant under the pointer; the map is not pinned yet.
    expect(screen.getByTestId('hud-time')).toHaveTextContent('2026-10-20 06:00:00Z');
    expect(store.get('time')).toEqual({ mode: 'live' });
    fireEvent.pointerUp(slider, { clientX: 50, pointerId: 1 });
    expect(store.get('time')).toEqual({ mode: 'asOf', asOf: '2026-10-20T06:00:00Z' });
    // Dragged back to Now, it is live again.
    fireEvent.pointerDown(slider, { clientX: 60, button: 0, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 99, pointerId: 1 });
    expect(store.get('time')).toEqual({ mode: 'live' });
  });

  it('plays history from six hours ago: the keyframe, then each frame, stepping the cursor', async () => {
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Play history' }));
    await act(async () => {});
    await act(async () => {});
    const frames = asked.find((path) => path.startsWith('/v1/history/frames'));
    expect(frames).toBe(
      '/v1/history/frames?kind=earthquake&from=2026-10-20T06%3A00%3A00Z&to=2026-10-20T12%3A00%3A00Z&step=180s',
    );
    expect(store.get('playback')).toMatchObject({ index: 0, playing: true });
    expect(store.get('time')).toEqual({ mode: 'asOf', asOf: '2026-10-20T06:00:00Z' });
    expect(screen.getByTestId('playback-step')).toHaveTextContent('Frame 1 of 3');
    await advance(PLAYBACK_STEP_MS);
    expect(store.get('playback')?.index).toBe(1);
    expect(store.get('time')).toEqual({ mode: 'asOf', asOf: '2026-10-20T06:03:00Z' });
    expect(store.get('playback')?.history.stateAt(1)).toHaveLength(2);
    await advance(PLAYBACK_STEP_MS);
    // The last frame: playback stops there.
    expect(store.get('playback')).toMatchObject({ index: 2, playing: false });
    expect(screen.getByRole('button', { name: 'Play history' })).toBeEnabled();
    await advance(PLAYBACK_STEP_MS * 3);
    expect(store.get('playback')?.index).toBe(2);
    // Playing again from the end starts over.
    fireEvent.click(screen.getByRole('button', { name: 'Play history' }));
    expect(store.get('playback')).toMatchObject({ index: 0, playing: true });
    fireEvent.click(screen.getByRole('button', { name: 'Pause playback' }));
    expect(store.get('playback')?.playing).toBe(false);
    // Back to live ends the playback.
    fireEvent.click(screen.getByRole('button', { name: 'Return to live' }));
    expect(store.get('playback')).toBeUndefined();
    expect(store.get('time')).toEqual({ mode: 'live' });
    expect(NOW - 6 * HOUR).toBe(Date.parse('2026-10-20T06:00:00Z'));
  });

  it('cannot play with no record layer on', () => {
    setup([]);
    expect(screen.getByRole('button', { name: 'Play history' })).toBeDisabled();
  });
});
