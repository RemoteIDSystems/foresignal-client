/*
 * The ForeSignal client's service worker (030). It does one job: Web Push. A push carries a
 * ForeSignal push message (`PushPayload`, `payloadFormat=foresignal`):
 *
 * - `verify`: the code a new subscription must echo. It is handed to every open page of the app
 *   (which posts it to `verifyPushSubscription`) and shown as a quiet notification.
 * - `alert`, `briefing`, `system`: shown as a notification. Activating it focuses an open page of
 *   the app on the alert (`?open=alert:<id>`), or opens one. An action button (ack, snooze, …)
 *   posts the backend's single-use capability URL and opens nothing.
 *
 * It caches nothing and evaluates nothing: the backend decides what is sent.
 */

/** The message type pages listen for to receive a verification code. */
const VERIFY_MESSAGE = 'foresignal.push.verify';
/** The message type pages listen for when a notification is activated with the page open. */
const OPEN_MESSAGE = 'foresignal.push.open';

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Reads a push's payload as JSON; undefined when it is missing or not JSON.
 *
 * @param {{ data?: { json(): unknown } | null }} event
 */
function payloadOf(event) {
  try {
    return event.data ? event.data.json() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The app path a notification opens: the alert when there is one, else the alerts screen.
 *
 * @param {Record<string, unknown>} payload
 */
function targetPath(payload) {
  const scope = new URL(self.registration.scope);
  const alertId = payload.alertId ?? (payload.event === 'alert' ? payload.id : undefined);
  if (alertId !== undefined && alertId !== null) {
    return `${scope.pathname}global?open=${encodeURIComponent(`alert:${String(alertId)}`)}`;
  }
  return `${scope.pathname}alerts`;
}

/**
 * Shows one push. A verification push also reaches every open page.
 *
 * @param {Record<string, unknown>} payload
 */
async function showPush(payload) {
  if (payload.event === 'verify') {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const page of pages) {
      page.postMessage({
        type: VERIFY_MESSAGE,
        subscriptionId: payload.subscriptionId,
        code: payload.code,
      });
    }
    await self.registration.showNotification('ForeSignal notifications', {
      body: 'This browser is being set up to receive alerts.',
      tag: 'foresignal-verify',
      silent: true,
      data: { verify: true },
    });
    return;
  }
  const title = String(payload.title ?? payload.shortTitle ?? 'ForeSignal');
  const actions = Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : [];
  await self.registration.showNotification(title, {
    body: typeof payload.body === 'string' ? payload.body : '',
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    silent: payload.silent === true,
    timestamp: typeof payload.ts === 'number' ? payload.ts : undefined,
    actions: actions.map((action) => ({ action: action.action, title: action.title })),
    data: {
      path: targetPath(payload),
      alertId: payload.alertId ?? null,
      actions,
      confirmUrl: payload.confirmUrl ?? null,
    },
  });
}

self.addEventListener('push', (event) => {
  const payload = payloadOf(event);
  if (!payload || typeof payload !== 'object') return;
  event.waitUntil(showPush(/** @type {Record<string, unknown>} */ (payload)));
});

/**
 * Focuses an open page of the app on `path`, or opens one.
 *
 * @param {string} path
 * @param {unknown} alertId
 */
async function openApp(path, alertId) {
  const url = new URL(path, self.location.origin).href;
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const page = pages.find((candidate) => new URL(candidate.url).origin === self.location.origin);
  if (page) {
    page.postMessage({ type: OPEN_MESSAGE, path, alertId });
    if ('focus' in page) await page.focus();
    return;
  }
  await self.clients.openWindow(url);
}

/**
 * Posts an action's capability URL; the backend acts once and the notification closes.
 *
 * @param {string} url
 */
async function runAction(url) {
  await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
}

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data ?? {};
  notification.close();
  if (data.verify) return;
  const action = (data.actions ?? []).find((candidate) => candidate.action === event.action);
  const work = action ? runAction(action.url) : openApp(data.path, data.alertId);
  try {
    event.waitUntil(work);
  } catch {
    // An untrusted (script-dispatched) event refuses waitUntil; the work still runs.
  }
});
