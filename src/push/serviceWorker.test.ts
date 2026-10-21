import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OPEN_MESSAGE, VERIFY_MESSAGE } from './webPush';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(`${root}public/sw.js`, 'utf8');

type Handler = (event: Record<string, unknown>) => void;

/** A page of the app as the worker sees it. */
interface FakeClient {
  url: string;
  postMessage: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
}

/** Runs `public/sw.js` against a fake worker scope and returns what it touches. */
function loadWorker(pages: FakeClient[] = []) {
  const handlers = new Map<string, Handler>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const self = {
    location: { origin: 'https://app.test' },
    registration: {
      scope: 'https://app.test/',
      showNotification: vi.fn(async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      }),
    },
    clients: {
      matchAll: vi.fn(async () => pages),
      openWindow: vi.fn(async () => null),
      claim: vi.fn(async () => undefined),
    },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
  };
  const fetch = vi.fn(async () => new Response('{}'));
  new Function('self', 'fetch', source)(self, fetch);
  /** Dispatches an event and waits for the work it hands to `waitUntil`. */
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let work: Promise<unknown> = Promise.resolve();
    handlers.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => (work = promise) });
    await work;
  };
  return { self, shown, fetch, dispatch };
}

/** A push event carrying `payload` as JSON. */
const pushOf = (payload: unknown) => ({ data: { json: () => payload } });

/** A page of the app. */
const page = (url = 'https://app.test/global'): FakeClient => ({
  url,
  postMessage: vi.fn(),
  focus: vi.fn(async () => undefined),
});

describe('the service worker', () => {
  it('hands a verification code to every open page and shows a quiet notification', async () => {
    const open = page();
    const { shown, dispatch } = loadWorker([open]);
    await dispatch('push', pushOf({ v: 1, event: 'verify', subscriptionId: 'sub-1', code: 'xyz' }));
    expect(open.postMessage).toHaveBeenCalledWith({
      type: VERIFY_MESSAGE,
      subscriptionId: 'sub-1',
      code: 'xyz',
    });
    expect(shown[0]!.options).toMatchObject({ silent: true, data: { verify: true } });
  });

  it('shows an alert push with its actions and the route of its alert', async () => {
    const { shown, dispatch } = loadWorker();
    await dispatch(
      'push',
      pushOf({
        v: 1,
        event: 'alert',
        id: 41,
        alertId: 7,
        severity: 'critical',
        title: 'Strong earthquakes near the Gulf',
        body: 'M6.1 earthquake',
        tag: 'foresignal-alert-7',
        actions: [{ action: 'ack', title: 'Acknowledge', url: 'https://api.test/v1/actions/tok' }],
      }),
    );
    expect(shown[0]!.title).toBe('Strong earthquakes near the Gulf');
    expect(shown[0]!.options).toMatchObject({
      body: 'M6.1 earthquake',
      tag: 'foresignal-alert-7',
      actions: [{ action: 'ack', title: 'Acknowledge' }],
      data: { path: '/global?open=alert%3A7', alertId: 7 },
    });
  });

  it('ignores a push without a readable payload', async () => {
    const { shown, dispatch } = loadWorker();
    await dispatch('push', { data: { json: () => JSON.parse('not json') } });
    await dispatch('push', { data: null });
    expect(shown).toEqual([]);
  });

  it('moves an open page to the alert, or opens one', async () => {
    const open = page();
    const withPage = loadWorker([open]);
    const close = vi.fn();
    const notification = {
      close,
      data: { path: '/global?open=alert%3A7', alertId: 7, actions: [] },
    };
    await withPage.dispatch('notificationclick', { notification, action: '' });
    expect(close).toHaveBeenCalled();
    expect(open.postMessage).toHaveBeenCalledWith({
      type: OPEN_MESSAGE,
      path: '/global?open=alert%3A7',
      alertId: 7,
    });
    expect(open.focus).toHaveBeenCalled();

    const none = loadWorker([]);
    await none.dispatch('notificationclick', { notification, action: '' });
    expect(none.self.clients.openWindow).toHaveBeenCalledWith(
      'https://app.test/global?open=alert%3A7',
    );
  });

  it('posts an action button’s capability URL and opens nothing', async () => {
    const { self, fetch, dispatch } = loadWorker([]);
    const notification = {
      close: vi.fn(),
      data: {
        path: '/global?open=alert%3A7',
        actions: [{ action: 'ack', title: 'Acknowledge', url: 'https://api.test/v1/actions/tok' }],
      },
    };
    await dispatch('notificationclick', { notification, action: 'ack' });
    expect(fetch).toHaveBeenCalledWith('https://api.test/v1/actions/tok', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });
});
