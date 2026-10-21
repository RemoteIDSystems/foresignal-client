import type { ForesignalClient } from '../api/client';
import {
  createPushSubscription,
  deletePushSubscription,
  getVapidPublicKey,
  verifyPushSubscription,
} from './pushApi';

/** Where this browser's push stands. */
export type PushStatus =
  'unsupported' | 'off' | 'subscribing' | 'verifying' | 'on' | 'denied' | 'error';

/** A snapshot of the push state for the toggle. */
export interface PushSnapshot {
  status: PushStatus;
  /** The backend's subscription id while subscribed or verifying. */
  subscriptionId?: string;
  /** Why the last attempt failed. */
  error?: string;
}

/** The message the service worker posts with a verification code. */
export const VERIFY_MESSAGE = 'foresignal.push.verify';
/** The message the service worker posts when a notification is activated with a page open. */
export const OPEN_MESSAGE = 'foresignal.push.open';
/** Where this browser remembers its subscription; the list operation needs `admin` scope. */
export const PUSH_STORAGE_KEY = 'foresignal.push';
/** How long to wait for the verification push, in ms. */
export const VERIFY_TIMEOUT_MS = 30_000;

/** What the push setup needs from the browser; the real one by default, fakes in tests. */
export interface PushEnvironment {
  /** The service worker container, or undefined when the browser has none. */
  serviceWorker: ServiceWorkerContainer | undefined;
  /** Whether the Push API is present. */
  pushSupported: boolean;
  /** The notification permission now. */
  permission: () => NotificationPermission;
  /** Asks for the notification permission. */
  requestPermission: () => Promise<NotificationPermission>;
  /** Where the subscription id is kept. */
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
  /** The service worker script's URL. */
  scriptUrl: string;
  /** The browser's language, sent so the backend can localize. */
  language: string;
}

/** The real browser environment. */
export function browserPushEnvironment(): PushEnvironment {
  const hasNotification = typeof Notification !== 'undefined';
  let storage: PushEnvironment['storage'];
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  return {
    serviceWorker: typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
    pushSupported: typeof window !== 'undefined' && 'PushManager' in window && hasNotification,
    permission: () => (hasNotification ? Notification.permission : 'denied'),
    requestPermission: () =>
      hasNotification ? Notification.requestPermission() : Promise.resolve('denied'),
    storage,
    scriptUrl: `${import.meta.env.BASE_URL}sw.js`,
    language: typeof navigator !== 'undefined' ? navigator.language : 'en',
  };
}

/** A base64url string as bytes (the VAPID key the Push API takes). */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * This browser's Web Push (030). Turning it on registers the service worker (`sw.js`), asks for
 * notification permission, subscribes with the server's VAPID key, registers the subscription
 * (`createPushSubscription`, alerts of every rule) and echoes the code from the verification push
 * the worker hands over (`verifyPushSubscription`). Turning it off deletes the subscription
 * (`deletePushSubscription`) and unsubscribes. The subscription id is remembered in this browser,
 * since listing subscriptions needs `admin` scope.
 */
export class WebPush {
  private snapshot: PushSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly pendingCodes = new Map<string, string>();
  private waiting?: { subscriptionId: string; resolve: (code: string) => void };
  private listening = false;

  /**
   * @param api The backend client.
   * @param getToken The bearer token; registering needs one.
   * @param env The browser.
   * @param timeoutMs How long to wait for the verification push.
   */
  constructor(
    private readonly api: ForesignalClient,
    private readonly getToken: () => string | null,
    private readonly env: PushEnvironment = browserPushEnvironment(),
    private readonly timeoutMs = VERIFY_TIMEOUT_MS,
  ) {
    this.snapshot = this.initial();
  }

  /** Subscribes to changes; returns the unsubscribe function. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The current state. */
  readonly get = (): PushSnapshot => this.snapshot;

  /** Turns push on for this browser. Resolves when it is on or has failed. */
  async enable(): Promise<void> {
    const container = this.env.serviceWorker;
    if (!container || !this.env.pushSupported) return this.set({ status: 'unsupported' });
    if (!this.getToken()) {
      return this.set({ status: 'error', error: 'Web Push needs an access token (Settings).' });
    }
    this.set({ status: 'subscribing' });
    try {
      const permission =
        this.env.permission() === 'granted' ? 'granted' : await this.env.requestPermission();
      if (permission !== 'granted') return this.set({ status: 'denied' });
      this.listen(container);
      const registration = await container.register(this.env.scriptUrl);
      await container.ready;
      const key = await getVapidPublicKey(this.api);
      const existing = await registration.pushManager.getSubscription();
      const browserSubscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(key),
        }));
      const json = browserSubscription.toJSON();
      const record = await createPushSubscription(this.api, {
        name: 'Browser',
        subscription: {
          endpoint: browserSubscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
        },
        filters: { events: ['alert'], ruleIds: null },
        transportLabel: 'browser',
        payloadFormat: 'foresignal',
        lang: this.env.language,
      });
      this.remember(record.id);
      this.set({ status: 'verifying', subscriptionId: record.id });
      const code = await this.codeFor(record.id);
      await verifyPushSubscription(this.api, record.id, code);
      this.set({ status: 'on', subscriptionId: record.id });
    } catch (error) {
      this.set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        ...(this.snapshot.subscriptionId ? { subscriptionId: this.snapshot.subscriptionId } : {}),
      });
    }
  }

  /** Turns push off: the backend forgets the subscription and the browser unsubscribes. */
  async disable(): Promise<void> {
    const id = this.snapshot.subscriptionId ?? this.env.storage?.getItem(PUSH_STORAGE_KEY);
    try {
      if (id) {
        await deletePushSubscription(this.api, id).catch((error: unknown) => {
          // Already gone on the backend: still unsubscribe here.
          if ((error as { status?: number }).status !== 404) throw error;
        });
      }
      const registration = await this.env.serviceWorker?.getRegistration(this.env.scriptUrl);
      const current = await registration?.pushManager.getSubscription();
      await current?.unsubscribe();
      this.env.storage?.removeItem(PUSH_STORAGE_KEY);
      this.set({ status: 'off' });
    } catch (error) {
      this.set({
        ...this.snapshot,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private initial(): PushSnapshot {
    if (!this.env.serviceWorker || !this.env.pushSupported) return { status: 'unsupported' };
    if (this.env.permission() === 'denied') return { status: 'denied' };
    const id = this.env.storage?.getItem(PUSH_STORAGE_KEY);
    return id ? { status: 'on', subscriptionId: id } : { status: 'off' };
  }

  private listen(container: ServiceWorkerContainer): void {
    if (this.listening) return;
    this.listening = true;
    container.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { type?: string; subscriptionId?: string; code?: string };
      if (data?.type !== VERIFY_MESSAGE || !data.subscriptionId || !data.code) return;
      if (this.waiting?.subscriptionId === data.subscriptionId) this.waiting.resolve(data.code);
      else this.pendingCodes.set(data.subscriptionId, data.code);
    });
  }

  /** The verification code for a subscription, which may arrive before its id is known. */
  private codeFor(subscriptionId: string): Promise<string> {
    const early = this.pendingCodes.get(subscriptionId);
    if (early) {
      this.pendingCodes.delete(subscriptionId);
      return Promise.resolve(early);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        reject(new Error('The verification push did not arrive; the subscription stays pending.'));
      }, this.timeoutMs);
      this.waiting = {
        subscriptionId,
        resolve: (code) => {
          clearTimeout(timer);
          this.waiting = undefined;
          resolve(code);
        },
      };
    });
  }

  private remember(id: string): void {
    try {
      this.env.storage?.setItem(PUSH_STORAGE_KEY, id);
    } catch {
      // A browser that cannot store keeps the id for this page only.
    }
  }

  private set(snapshot: PushSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
