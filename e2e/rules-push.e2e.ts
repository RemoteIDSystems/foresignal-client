import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { me } from '../src/annotations/testing/annotationFixtures';
import { storedRule, testResult } from '../src/rules/testing/ruleFixtures';
import { collectProblems } from './support';

/**
 * Alert rules and Web Push (030). Writing rules, dry runs and push subscriptions need a token, so
 * the page runs with a test token: those operations are stand-ins, and every other request goes
 * to the backend without the token, as an open read. Pushes are delivered to the real service
 * worker through the Chrome DevTools Protocol; the browser's push service is stood in, since a
 * headless browser has none.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

/** The requests the stand-ins answered, as `METHOD path?query` with the JSON body. */
let calls: { line: string; body: unknown }[] = [];

/** A valid uncompressed P-256 point, base64url (the VAPID key's shape). */
const VAPID_KEY =
  'BOrtRt1E2EvjWkdC52lxoVnpRiRQd5eXh2V_zXXDV-XBAkEo2SOBXbUcZrKPiU4lqNx-YzcV0TkS3mwHsnWNLA4';

function record(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  calls.push({
    line: `${request.method()} ${url.pathname}${url.search}`,
    body: request.postData() ? (JSON.parse(request.postData()!) as unknown) : undefined,
  });
}

async function standIns(page: Page) {
  const saved: ReturnType<typeof storedRule>[] = [];
  await page.addInitScript(() => localStorage.setItem('foresignal.token', 'fs_e2e_token'));
  await page.route(/\/v1\//, (route) => {
    const headers = { ...route.request().headers() };
    delete headers.authorization;
    return route.continue({ headers });
  });
  await page.route(/\/v1\/tokens\/current\/device$/, (route) => route.fulfill({ json: {} }));
  await page.route(/\/v1\/stream-tickets$/, (route) =>
    route.fulfill({
      json: {
        ticket: 'fst_e2e',
        purpose: 'stream',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    }),
  );
  await page.route(/\/v1\/me$/, (route) => route.fulfill({ json: me('agent') }));
  // The token-only reads the shell and the Alerts screen make, answered empty.
  await page.route(/\/v1\/notifications\/badge$/, (route) =>
    route.fulfill({ json: { unread: 0, unreadCritical: 0, latestId: null } }),
  );
  await page.route(/\/v1\/notifications(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.route(/\/v1\/notifications\/stream/, (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: ':open\n\n' }),
  );
  await page.route(/\/v1\/clients\/presence$/, (route) =>
    route.fulfill({
      json: { deviceKey: 'e2e', kind: 'web', state: 'active', expiresAt: new Date().toISOString() },
    }),
  );
  await page.route(/\/v1\/watchlists(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.route(/\/v1\/channels(\/types)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/triggers(\?.*)?$/, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: saved });
    record(route);
    const body = JSON.parse(route.request().postData()!) as { name: string; enabled: boolean };
    const rule = storedRule({ ...body, id: body.enabled ? 'saved-1' : 'copy-1' } as never);
    if (body.enabled) saved.push(rule);
    return route.fulfill({ status: 201, json: rule });
  });
  await page.route(/\/v1\/triggers\/copy-1\/test/, (route) => {
    record(route);
    return route.fulfill({ json: testResult() });
  });
  await page.route(/\/v1\/triggers\/copy-1$/, (route) => {
    record(route);
    return route.fulfill({ status: 204 });
  });
  await page.route(/\/v1\/push\/vapid-public-key$/, (route) =>
    route.fulfill({ json: { publicKey: VAPID_KEY } }),
  );
  await page.route(/\/v1\/push\/subscriptions$/, (route) => {
    record(route);
    return route.fulfill({
      status: 201,
      json: {
        id: 'sub-1',
        endpointHost: 'push.e2e.test',
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
    });
  });
  await page.route(/\/v1\/push\/subscriptions\/sub-1\/verify$/, (route) => {
    record(route);
    return route.fulfill({
      json: {
        id: 'sub-1',
        endpointHost: 'push.e2e.test',
        createdAt: new Date().toISOString(),
        status: 'active',
      },
    });
  });
  await page.route(/\/v1\/objects\/alert%3A5$/, (route) => {
    record(route);
    return route.fulfill({
      json: {
        envelope: { ref: 'alert:5', type: 'alert', title: 'Strong earthquakes near the Gulf' },
        sections: {},
      },
    });
  });
}

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
  calls = [];
  await standIns(page);
});

test('author a rule: the dry run renders inline, then it is saved', async ({ page }) => {
  await page.goto('/alerts');
  await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible();
  await page.getByRole('tab', { name: 'Rules' }).click();
  await page.getByRole('button', { name: 'New rule' }).click();
  const form = page.getByRole('form', { name: 'New alert rule' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Russia–NATO watch');
  await form.getByRole('combobox', { name: 'Watch' }).selectOption('region');
  await form.getByRole('textbox', { name: /Region codes/ }).fill('RU, PL, EE');
  await form.getByRole('button', { name: 'Add condition' }).click();
  await form.getByRole('textbox', { name: 'Condition 1 field' }).fill('mag');
  await form.getByRole('textbox', { name: 'Condition 1 value' }).fill('5');
  await form.getByRole('button', { name: 'Dry run' }).click();

  const preview = page.getByRole('region', { name: 'Dry run result' });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Would fire');
  await expect(preview).toContainText('COOLDOWN_APPLIED');
  await expect(preview.getByRole('row')).toHaveCount(3);
  expect(calls.map((call) => call.line.replace(/\?.*/, ''))).toEqual([
    'POST /v1/triggers',
    'POST /v1/triggers/copy-1/test',
    'DELETE /v1/triggers/copy-1',
  ]);
  expect(calls[0]!.body).toMatchObject({
    enabled: false,
    geofenceRef: { country: ['RU', 'PL', 'EE'] },
    conditions: [{ path: 'mag', op: '>=', value: 5 }],
  });
  expect(calls[1]!.line).toContain('simulate=true');

  await form.getByRole('button', { name: 'Save rule' }).click();
  await expect(page.getByRole('listitem', { name: 'Russia–NATO watch' })).toBeVisible();
  expect(calls.at(-1)!.body).toMatchObject({ name: 'Russia–NATO watch', enabled: true });
  expect(problems).toEqual([]);
});

/** Delivers a push message to the page's service worker registration. */
async function pushTo(context: BrowserContext, page: Page, data: unknown) {
  const cdp = await context.newCDPSession(page);
  const registration = new Promise<string>((resolve) =>
    cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      const found = registrations.find((entry) => !entry.isDeleted);
      if (found) resolve(found.registrationId);
    }),
  );
  await cdp.send('ServiceWorker.enable');
  const origin = new URL(page.url()).origin;
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin,
    registrationId: await registration,
    data: JSON.stringify(data),
  });
  await cdp.detach();
}

test('subscribe: a verification push turns it on, and an alert push opens the alert', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['notifications']);
  // A headless browser has no push service: the subscription itself is stood in.
  await page.addInitScript(() => {
    const subscription = {
      endpoint: 'https://push.e2e.test/send/abc',
      toJSON: () => ({
        endpoint: 'https://push.e2e.test/send/abc',
        keys: { p256dh: 'BOrtRt1E2Evj', auth: 'e2e-auth' },
      }),
      unsubscribe: async () => true,
    };
    PushManager.prototype.subscribe = async () => subscription as unknown as PushSubscription;
    PushManager.prototype.getSubscription = async () => null;
  });
  await page.goto('/alerts?tab=delivery');
  const toggle = page.getByRole('switch', { name: 'Browser notifications for alerts' });
  await toggle.click();
  await expect(page.getByText('Waiting for the verification push…')).toBeVisible();
  expect(calls.find((call) => call.line === 'POST /v1/push/subscriptions')?.body).toMatchObject({
    transportLabel: 'browser',
    payloadFormat: 'foresignal',
    filters: { events: ['alert'] },
  });

  await pushTo(context, page, { v: 1, event: 'verify', subscriptionId: 'sub-1', code: 'c0de' });
  await expect(page.getByText('On', { exact: true })).toBeVisible();
  expect(calls.find((call) => call.line.endsWith('/verify'))?.body).toEqual({ code: 'c0de' });

  await pushTo(context, page, {
    v: 1,
    event: 'alert',
    id: 41,
    alertId: 5,
    severity: 'critical',
    title: 'Strong earthquakes near the Gulf',
    body: 'M6.1 earthquake, 40 km S of Freeport',
    tag: 'foresignal-alert-5',
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        // This runs in the worker, whose global is a ServiceWorkerGlobalScope.
        const scope = self as unknown as { registration: ServiceWorkerRegistration };
        return (await scope.registration.getNotifications()).map((shown) => shown.title);
      }),
    )
    .toContain('Strong earthquakes near the Gulf');

  // Activating the notification moves the open page to the alert.
  await worker.evaluate(async () => {
    const scope = self as unknown as {
      registration: ServiceWorkerRegistration;
      NotificationEvent: new (type: string, init: { notification: Notification }) => Event;
    };
    const [shown] = await scope.registration.getNotifications({ tag: 'foresignal-alert-5' });
    self.dispatchEvent(new scope.NotificationEvent('notificationclick', { notification: shown! }));
  });
  await expect(page).toHaveURL(/\/global/);
  await expect
    .poll(() => calls.some((call) => call.line === 'GET /v1/objects/alert%3A5'))
    .toBe(true);
  expect(problems).toEqual([]);
});
