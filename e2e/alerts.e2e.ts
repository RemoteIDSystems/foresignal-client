import { expect, test, type Page, type Route } from '@playwright/test';
import { me } from '../src/annotations/testing/annotationFixtures';
import { alert, item } from '../src/alerts/testing/alertFixtures';
import { collectProblems } from './support';

/**
 * Alerts and notifications (029). The inbox and the lifecycle calls need a token, and the local
 * backend has no alerts, so the page runs with a test token: the token-only operations are
 * stand-ins, and every other request goes to the backend without the token, as an open read.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

/** The requests the stand-ins answered, as `METHOD path` with the JSON body. */
let calls: { line: string; body: unknown }[] = [];

/** An event-stream answer carrying the given events, then closing (the client reconnects). */
function events(route: Route, list: { event: string; id?: string; data: unknown }[]) {
  const body = list
    .map(
      (entry) =>
        `event: ${entry.event}\n${entry.id ? `id: ${entry.id}\n` : ''}data: ${JSON.stringify(entry.data)}\n\n`,
    )
    .join('');
  return route.fulfill({ contentType: 'text/event-stream', body: `:open\n\n${body}` });
}

async function standIns(page: Page) {
  let unread = 2;
  const FIRED = alert(5, { severity: 'critical', firedAt: new Date().toISOString() });
  await page.addInitScript(() => localStorage.setItem('foresignal.token', 'fs_e2e_token'));
  // Everything not stood in below goes to the backend as an open read, without the test token.
  await page.route(/\/v1\//, (route) => {
    const headers = { ...route.request().headers() };
    delete headers.authorization;
    return route.continue({ headers });
  });
  const record = (route: Route) => {
    const request = route.request();
    calls.push({
      line: `${request.method()} ${new URL(request.url()).pathname}`,
      body: request.postData() ? (JSON.parse(request.postData()!) as unknown) : undefined,
    });
  };
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
  await page.route(/\/v1\/alerts(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.route(/\/v1\/alerts\/stream/, (route) =>
    events(route, [{ event: 'alert', id: '5', data: { type: 'fired', alert: FIRED } }]),
  );
  await page.route(/\/v1\/alerts\/5\/ack$/, (route) => {
    record(route);
    return route.fulfill({ json: { ...FIRED, state: 'acknowledged', rev: 50 } });
  });
  await page.route(/\/v1\/notifications\/badge$/, (route) =>
    route.fulfill({ json: { unread, unreadCritical: 0, latestId: 12 } }),
  );
  await page.route(/\/v1\/notifications(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        items: [item(12, { read: unread === 0 }), item(11, { read: unread === 0 })],
        nextCursor: null,
      },
    }),
  );
  await page.route(/\/v1\/notifications\/read$/, (route) => {
    record(route);
    unread = 0;
    return route.fulfill({ json: { unread, unreadCritical: 0, latestId: 12 } });
  });
  await page.route(/\/v1\/notifications\/stream/, (route) => events(route, []));
  await page.route(/\/v1\/clients\/presence$/, (route) => {
    record(route);
    const body = JSON.parse(route.request().postData() ?? '{}') as { state: string };
    return route.fulfill({
      json: {
        deviceKey: 'e2e',
        kind: 'web',
        state: body.state,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      },
    });
  });
}

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
  calls = [];
  await standIns(page);
});

test('a firing alert toasts, and Ack acknowledges it', async ({ page }) => {
  await page.goto('/operations');
  const toast = page.getByTestId('alert-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute('data-severity', 'critical');
  await expect(toast).toContainText('Strong earthquakes near the Gulf');
  // Severity-colored, as a person sees it: the left edge is the danger color, not the border's.
  const edge = await toast.evaluate((element) => getComputedStyle(element).borderLeftColor);
  const border = await toast.evaluate((element) => getComputedStyle(element).borderTopColor);
  expect(edge).not.toBe(border);
  await expect(page.getByTestId('alert-strip')).toContainText('1 firing');

  const box = (await toast.getByRole('button', { name: 'Ack' }).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(toast).toBeHidden();
  expect(calls.map((call) => call.line)).toContain('POST /v1/alerts/5/ack');
  await expect(page.getByTestId('alert-strip')).toContainText('0 firing, 1 acknowledged');
  expect(problems).toEqual([]);
});

test('the bell shows the unread badge, and it clears when read', async ({ page }) => {
  await page.goto('/operations');
  const bell = page.getByTestId('notification-bell');
  await expect(bell).toHaveAttribute('data-unread', '2');
  await expect(bell).toHaveAccessibleName('Notifications, 2 unread');
  await expect(bell).toContainText('2');
  await bell.click();
  const inbox = page.getByRole('dialog', { name: 'Notifications' });
  await expect(inbox.getByRole('list', { name: 'Inbox' }).getByRole('button')).toHaveCount(2);
  await inbox.getByRole('button', { name: 'Mark all read' }).click();
  await expect(bell).toHaveAttribute('data-unread', '0');
  await expect(bell).toHaveAccessibleName('Notifications');
  expect(calls.find((call) => call.line === 'POST /v1/notifications/read')?.body).toEqual({
    upToId: 12,
  });
  // Reading never acknowledges an alert.
  expect(calls.map((call) => call.line)).not.toContain('POST /v1/alerts/12/ack');
  expect(problems).toEqual([]);
});

test('presence is reported as a web client', async ({ page }) => {
  await page.goto('/operations');
  await expect
    .poll(() => calls.filter((call) => call.line === 'POST /v1/clients/presence').length)
    .toBeGreaterThan(0);
  const first = calls.find((call) => call.line === 'POST /v1/clients/presence')!.body as {
    kind: string;
    state: string;
    ttlSeconds: number;
  };
  expect(first.kind).toBe('web');
  expect(['active', 'idle']).toContain(first.state);
  expect(first.ttlSeconds).toBe(120);
  expect(problems).toEqual([]);
});
