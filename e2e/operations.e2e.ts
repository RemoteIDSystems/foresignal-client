import { expect, test, type Page } from '@playwright/test';
import { alert } from '../src/alerts/testing/alertFixtures';
import { collectProblems } from './support';

/**
 * The Operations console (033). Source health, alert rules, briefings and analysis cycles are the
 * backend's own open reads. The local backend has no alerts, so the queue's open alerts are a
 * stand-in. The panels that need a token (exports, channels, sinks, push devices, escalation
 * policies, chronicles) are stood in as empty, since a 401 would be a console error.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

async function standIns(page: Page) {
  await page.route(/\/v1\/alerts(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        items: [alert(5, { ruleName: 'Strong quakes', severity: 'critical' })],
        nextCursor: null,
      },
    }),
  );
  const empty = { items: [], nextCursor: null };
  await page.route(/\/v1\/exports(\?.*)?$/, (route) => route.fulfill({ json: empty }));
  await page.route(/\/v1\/channels$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/sinks(\?.*)?$/, (route) => route.fulfill({ json: empty }));
  await page.route(/\/v1\/push\/devices$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/escalation-policies$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/chronicles(\?.*)?$/, (route) => route.fulfill({ json: empty }));
}

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
  await standIns(page);
});

test('the Operations tab: Tasks, Assets and Workflows render with data', async ({ page }) => {
  await page.goto('/global');
  await page.getByRole('link', { name: 'Operations' }).click();
  await expect(page).toHaveURL(/\/operations$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Operations' })).toBeVisible();

  const tasks = page.getByTestId('ops-tasks');
  await expect(
    tasks
      .getByRole('region', { name: 'Alert Queue' })
      .getByRole('listitem', { name: 'Strong quakes' }),
  ).toContainText('critical');

  // The source-health board is the backend's: every source counted, the enabled ones listed.
  const assets = page.getByTestId('ops-assets');
  const board = assets.getByRole('region', { name: 'Source Health' });
  await expect(board).toHaveAttribute('data-state', 'ready');
  await expect(board.getByTestId('health-counts')).toContainText('healthy');
  expect(await board.getByRole('listitem').count()).toBeGreaterThan(0);

  // Analysis cycles are the backend's (it ships a daily cycle).
  const workflows = page.getByTestId('ops-workflows');
  const cycles = workflows.getByRole('region', { name: 'Analysis Cycles' });
  await expect(cycles).toHaveAttribute('data-state', 'ready');
  expect(await cycles.getByRole('listitem').count()).toBeGreaterThan(0);
  await expect(workflows.getByRole('region', { name: 'Alert Rules' })).toHaveAttribute(
    'data-state',
    'ready',
  );
  expect(problems).toEqual([]);
});
