import { expect, test } from '@playwright/test';
import { collectProblems } from './support';

/** The Map tab (visual pass): the full-screen 2D map and 3D globe, with the map's own controls. */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(({ page }) => {
  problems = collectProblems(page);
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

test('the Map tab shows the map filling the screen, and switches to the globe', async ({
  page,
}) => {
  await page.goto('/global');
  await page.getByRole('link', { name: 'Map', exact: true }).click();
  await expect(page).toHaveURL(/\/map$/);
  const canvas = page.getByTestId('full-map').locator('.cesium-widget canvas');
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  const viewport = page.viewportSize()!;
  // Everything under the top bar: no rail or panels beside or below it.
  expect(box!.width).toBeGreaterThan(viewport.width - 40);
  expect(box!.height).toBeGreaterThan(viewport.height - 120);
  await page.getByRole('tab', { name: '3D Globe' }).click();
  await expect(page.locator('[data-scene-mode]')).toHaveAttribute('data-scene-mode', '3d');
});
