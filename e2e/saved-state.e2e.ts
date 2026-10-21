import { expect, test, type Page, type Route } from '@playwright/test';
import { me } from '../src/annotations/testing/annotationFixtures';
import {
  collectProblems,
  EARTHQUAKE_RGB,
  expectLiveEarthquakes,
  kindToggle,
  openGlobal,
  pixelsNear,
  waitForRecords,
} from './support';
import { standInTestToken } from './standIns';

/**
 * Saved state (031). Saving a view writes to the backend, so the views operations are stand-ins
 * that keep what was saved; the view's tiles are the earthquake layer's real tiles, fetched from
 * the backend, so reopening the view draws the same records the kind layer drew.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

/** The view bodies the stand-in was sent. */
let posted: Record<string, unknown>[] = [];

async function standIns(page: Page) {
  const views: Record<string, unknown>[] = [];
  await standInTestToken(page);
  await page.route(/\/v1\/me$/, (route) => route.fulfill({ json: me('agent') }));
  await page.route(/\/v1\/views(\?.*)?$/, async (route: Route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { items: views, nextCursor: null } });
    const body = JSON.parse(route.request().postData()!) as Record<string, unknown>;
    posted.push(body);
    const now = new Date().toISOString();
    const view = { ...body, id: 'view-e2e', version: 1, createdAt: now, updatedAt: now };
    views.push(view);
    return route.fulfill({ status: 201, json: view });
  });
  await page.route(/\/v1\/views\/view-e2e$/, (route) => route.fulfill({ json: views[0] }));
  await page.route(/\/v1\/views\/view-e2e\/tiles\.json$/, (route) =>
    route.fulfill({
      json: {
        tilejson: '3.0.0',
        tiles: [`${new URL(route.request().url()).origin}/v1/views/view-e2e/tiles/{z}/{x}/{y}.mvt`],
        minzoom: 0,
        maxzoom: 14,
      },
    }),
  );
  await page.route(/\/v1\/views\/view-e2e\/tiles\/\d+\/\d+\/\d+\.mvt/, async (route) => {
    const url = route.request().url().replace('/v1/views/view-e2e/tiles/', '/v1/tiles/earthquake/');
    const response = await route.fetch({ url, headers: {} });
    return route.fulfill({ response });
  });
  await page.route(/\/v1\/views\/view-e2e\/stream/, (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: ':open\n\n' }),
  );
}

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  posted = [];
  await expectLiveEarthquakes(request);
  await standIns(page);
});

test('save the view, then reopen it: the same layers come back from the view', async ({ page }) => {
  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  const shown = await pixelsNear(page, EARTHQUAKE_RGB);

  await page.getByRole('button', { name: 'Save view' }).click();
  await page.getByRole('textbox', { name: 'View name' }).fill('E2E quakes');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved “E2E quakes”.')).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({
    slug: 'e2e-quakes',
    name: 'E2E quakes',
    kinds: ['earthquake'],
  });

  // Clear the map, then reopen the view from the Saved dialog.
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).uncheck();
  await waitForRecords(page, false);
  await page.getByRole('button', { name: 'Saved Views' }).click();
  const dialog = page.getByTestId('saved-dialog');
  await dialog
    .getByRole('listitem', { name: 'E2E quakes' })
    .getByRole('button', { name: 'Open' })
    .click();
  await expect(dialog).toBeHidden();

  const open = page.getByTestId('open-view');
  await expect(open).toContainText('E2E quakes');
  await expect(open).toHaveAttribute('data-state', 'ready');
  await waitForRecords(page, true);
  expect(await pixelsNear(page, EARTHQUAKE_RGB)).toBeGreaterThan(shown / 2);
  await expect(await kindToggle(page, 'Disasters / Hazards', 'earthquake')).toBeChecked();

  // Closing the view keeps the same kinds on, now drawn by the kind layer again.
  await open.getByRole('button', { name: 'Close saved view' }).click();
  await expect(open).toBeHidden();
  await waitForRecords(page, true);
  expect(problems).toEqual([]);
});
