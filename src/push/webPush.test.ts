import { json, standInApi } from '../intel/testing/standIn';
import {
  base64UrlToBytes,
  PUSH_STORAGE_KEY,
  VERIFY_MESSAGE,
  WebPush,
  type PushEnvironment,
} from './webPush';

const KEY =
  'BOrtRt1E2EvjWkdC52lxoVnpRiRQd5eXh2V_zXXDV-XBAkEo2SOBXbUcZrKPiU4lqNx-YzcV0TkS3mwHsnWNLA4';

/** A browser push subscription. */
function browserSubscription() {
  return {
    endpoint: 'https://push.example.test/send/abc',
    toJSON: () => ({
      endpoint: 'https://push.example.test/send/abc',
      keys: { p256dh: 'p', auth: 'a' },
    }),
    unsubscribe: vi.fn(async () => true),
  };
}

/** A fake service worker container and storage, and the messages the worker would post. */
function fakeEnvironment(permission: NotificationPermission = 'default') {
  const listeners = new Set<(event: MessageEvent) => void>();
  const subscription = browserSubscription();
  let subscribed: ReturnType<typeof browserSubscription> | null = null;
  const pushManager = {
    getSubscription: vi.fn(async () => subscribed),
    subscribe: vi.fn(async (options: PushSubscriptionOptionsInit) => {
      void options;
      subscribed = subscription;
      return subscription;
    }),
  };
  const registration = { pushManager };
  const store = new Map<string, string>();
  const container = {
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
    getRegistration: vi.fn(async () => registration),
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MessageEvent) => void) =>
      listeners.delete(listener),
  };
  const env: PushEnvironment = {
    serviceWorker: container as unknown as ServiceWorkerContainer,
    pushSupported: true,
    permission: () => permission,
    requestPermission: vi.fn(async () => 'granted' as const),
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
      removeItem: (key) => void store.delete(key),
    },
    scriptUrl: '/sw.js',
    language: 'en-US',
  };
  /** Posts what the worker posts when the verification push arrives. */
  const verifyPush = (subscriptionId: string, code: string) => {
    for (const listener of listeners)
      listener({ data: { type: VERIFY_MESSAGE, subscriptionId, code } } as MessageEvent);
  };
  return { env, container, pushManager, subscription, store, verifyPush };
}

/** A backend that registers subscription `sub-1` and accepts its code. */
function pushBackend(onCreate?: () => void) {
  return standInApi({
    'GET /v1/push/vapid-public-key': () => json({ publicKey: KEY }),
    'POST /v1/push/subscriptions': () => {
      onCreate?.();
      return json(
        {
          id: 'sub-1',
          endpointHost: 'push.example.test',
          createdAt: '2026-10-20T12:00:00Z',
          status: 'pending',
        },
        201,
      );
    },
    'POST /v1/push/subscriptions/sub-1/verify': () =>
      json({
        id: 'sub-1',
        endpointHost: 'push.example.test',
        createdAt: '2026-10-20T12:00:00Z',
        status: 'active',
      }),
    'DELETE /v1/push/subscriptions/sub-1': () => new Response(null, { status: 204 }),
  });
}

describe('Web Push', () => {
  it('decodes the base64url VAPID key into the 65-byte public point', () => {
    const bytes = base64UrlToBytes(KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });

  it('registers, subscribes, registers the subscription and echoes the verification code', async () => {
    const { env, container, pushManager, store, verifyPush } = fakeEnvironment();
    const { api, asked, bodies } = pushBackend();
    const push = new WebPush(api, () => 'token', env);
    expect(push.get()).toEqual({ status: 'off' });
    const states: string[] = [];
    push.subscribe(() => states.push(push.get().status));

    const enabling = push.enable();
    await vi.waitFor(() => expect(push.get().status).toBe('verifying'));
    verifyPush('sub-1', 'the-code');
    await enabling;

    expect(push.get()).toEqual({ status: 'on', subscriptionId: 'sub-1' });
    expect(states).toEqual(['subscribing', 'verifying', 'on']);
    expect(env.requestPermission).toHaveBeenCalled();
    expect(container.register).toHaveBeenCalledWith('/sw.js');
    const options = pushManager.subscribe.mock.calls[0]![0];
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toEqual(base64UrlToBytes(KEY));
    expect(asked).toEqual([
      'GET /v1/push/vapid-public-key',
      'POST /v1/push/subscriptions',
      'POST /v1/push/subscriptions/sub-1/verify',
    ]);
    expect(bodies[1]).toEqual({
      name: 'Browser',
      subscription: {
        endpoint: 'https://push.example.test/send/abc',
        keys: { p256dh: 'p', auth: 'a' },
      },
      filters: { events: ['alert'], ruleIds: null },
      transportLabel: 'browser',
      payloadFormat: 'foresignal',
      lang: 'en-US',
    });
    expect(bodies[2]).toEqual({ code: 'the-code' });
    expect(store.get(PUSH_STORAGE_KEY)).toBe('sub-1');
  });

  it('takes a code that arrives before the subscription id', async () => {
    const holder: { verify?: (id: string, code: string) => void } = {};
    const { env, verifyPush } = fakeEnvironment('granted');
    holder.verify = verifyPush;
    const { api, bodies } = pushBackend(() => holder.verify?.('sub-1', 'early-code'));
    const push = new WebPush(api, () => 'token', env);
    await push.enable();
    expect(push.get().status).toBe('on');
    expect(env.requestPermission).not.toHaveBeenCalled();
    expect(bodies.at(-1)).toEqual({ code: 'early-code' });
  });

  it('stays pending, and says so, when the verification push never comes', async () => {
    const { env } = fakeEnvironment('granted');
    const { api } = pushBackend();
    const push = new WebPush(api, () => 'token', env, 20);
    await push.enable();
    expect(push.get()).toMatchObject({ status: 'error', subscriptionId: 'sub-1' });
    expect(push.get().error).toMatch(/verification push did not arrive/);
  });

  it('needs a token, permission and a browser that supports push', async () => {
    const { env } = fakeEnvironment();
    const { api, asked } = pushBackend();
    const noToken = new WebPush(api, () => null, env);
    await noToken.enable();
    expect(noToken.get()).toMatchObject({ status: 'error', error: expect.stringMatching(/token/) });

    const refused = new WebPush(api, () => 'token', {
      ...env,
      requestPermission: async () => 'denied',
    });
    await refused.enable();
    expect(refused.get().status).toBe('denied');
    expect(
      new WebPush(api, () => 'token', { ...env, permission: () => 'denied' }).get().status,
    ).toBe('denied');
    expect(new WebPush(api, () => 'token', { ...env, serviceWorker: undefined }).get().status).toBe(
      'unsupported',
    );
    expect(asked).toEqual([]);
  });

  it('turns off: the backend forgets it, the browser unsubscribes, the id is cleared', async () => {
    const { env, store, subscription, pushManager } = fakeEnvironment('granted');
    store.set(PUSH_STORAGE_KEY, 'sub-1');
    await pushManager.subscribe({});
    const { api, asked } = pushBackend();
    const push = new WebPush(api, () => 'token', env);
    expect(push.get()).toEqual({ status: 'on', subscriptionId: 'sub-1' });
    await push.disable();
    expect(asked).toEqual(['DELETE /v1/push/subscriptions/sub-1']);
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(store.has(PUSH_STORAGE_KEY)).toBe(false);
    expect(push.get()).toEqual({ status: 'off' });
  });
});
