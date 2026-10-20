import { expect, test } from '@playwright/test';
import {
  collectProblems,
  expectLiveEarthquakes,
  kindToggle,
  openGlobal,
  waitForRecords,
} from './support';

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  await expectLiveEarthquakes(request);
});

test('the layers, the scene and the viewport live in the store, so they outlast the page', async ({
  page,
}) => {
  await openGlobal(page);
  const map = page.getByTestId('map-viewer');
  const toggle = await kindToggle(page, 'Disasters / Hazards', 'earthquake');
  await toggle.check();
  await waitForRecords(page, true);
  await page.getByRole('tab', { name: '3D Globe' }).click();
  await expect(map).toHaveAttribute('data-scene-mode', '3d');
  await page.waitForTimeout(2_000);
  // Over Europe, where the map does not open by default; the view is committed once it rests.
  await page.evaluate(() => {
    const { camera, scene } = window.__foresignalEngine!.viewer;
    const destination = scene.globe.ellipsoid.cartographicToCartesian({
      longitude: (10 * Math.PI) / 180,
      latitude: (50 * Math.PI) / 180,
      height: 4_000_000,
    } as never);
    camera.setView({ destination });
  });
  await page.waitForTimeout(2_000);

  // Away to another view and back: the Global page and its map are built anew, from the store.
  await page.getByRole('link', { name: /Analyst/ }).click();
  await expect(map).toHaveCount(0);
  await page.getByRole('link', { name: /Global/ }).click();
  await page.locator('.cesium-widget canvas').waitFor();
  await expect(map).toHaveAttribute('data-scene-mode', '3d');
  await expect(await kindToggle(page, 'Disasters / Hazards', 'earthquake')).toBeChecked();
  await waitForRecords(page, true);
  // The globe is shown as 3D, not morphed there again: the scene was created in the store's mode.
  const mode = await page.evaluate(() => window.__foresignalEngine?.viewer.scene.mode);
  expect(mode).toBe(3);
  // And it opens over the view it last committed (the area, rebuilt from its box): Europe is in
  // the middle of the map, not the default view of the Americas.
  const canvas = (await page.locator('.cesium-widget canvas').boundingBox())!;
  const europe = await page.evaluate(() => window.__foresignalEngine!.toScreen(10, 50));
  expect(europe).toBeDefined();
  expect(Math.abs(europe!.x - canvas.width / 2)).toBeLessThan(canvas.width / 4);
  expect(Math.abs(europe!.y - canvas.height / 2)).toBeLessThan(canvas.height / 4);
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: 'review/012-state-store.png' });

  // The store's scene mode is the map's, whoever sets it: back to the 2D map from the tab.
  await page.getByRole('tab', { name: '2D Map' }).click();
  await expect(map).toHaveAttribute('data-scene-mode', '2d');
  expect(problems).toEqual([]);
});
