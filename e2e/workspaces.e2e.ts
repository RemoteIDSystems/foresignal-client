import { expect, test, type Page } from '@playwright/test';
import { collectProblems, expectLiveEarthquakes, kindToggle, openGlobal } from './support';

/**
 * Deep links (025). `createContextLink` is open while open reads are on, so the link is the live
 * backend's: made on one page, opened in a fresh browser context with nothing in memory or
 * storage, where it must restore the same layers and view. Workspaces themselves need a token,
 * which the local run does not have.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  await expectLiveEarthquakes(request);
});

/** Whether a place is near the middle of the map. */
async function nearMiddle(page: Page, longitude: number, latitude: number): Promise<boolean> {
  const canvas = await page.locator('.cesium-widget canvas').boundingBox();
  const point = await page.evaluate(
    ([lon, lat]) => window.__foresignalEngine?.toScreen(lon!, lat!),
    [longitude, latitude],
  );
  if (!canvas || !point) return false;
  return (
    Math.abs(point.x - canvas.width / 2) < canvas.width / 4 &&
    Math.abs(point.y - canvas.height / 2) < canvas.height / 4
  );
}

test('a deep link round-trip restores the layers and the view', async ({ page, browser }) => {
  await openGlobal(page);
  const toggle = await kindToggle(page, 'Disasters / Hazards', 'earthquake');
  const wasOn = await toggle.isChecked();
  await toggle.setChecked(!wasOn);
  // Over Europe, where the map does not open by default; the view is committed once it rests.
  await page.evaluate(() => {
    const { camera, scene } = window.__foresignalEngine!.viewer;
    camera.setView({
      destination: scene.globe.ellipsoid.cartographicToCartesian({
        longitude: (10 * Math.PI) / 180,
        latitude: (50 * Math.PI) / 180,
        height: 4_000_000,
      } as never),
    });
  });
  await page.waitForTimeout(2_000);

  await page.getByRole('button', { name: 'Workspaces' }).click();
  const dialog = page.getByRole('dialog', { name: 'Workspaces' });
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  const link = await dialog.getByRole('textbox', { name: 'Link' }).inputValue();
  expect(link).toMatch(/\/global#fs=[A-Za-z0-9_-]+$/);
  expect(problems).toEqual([]);

  // A fresh browser: the link alone carries the state.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  const otherProblems = collectProblems(other);
  await other.goto(link);
  await other.locator('.cesium-widget canvas').waitFor();
  await expect(await kindToggle(other, 'Disasters / Hazards', 'earthquake')).toBeChecked({
    checked: !wasOn,
  });
  await expect(other.getByTestId('map-viewer')).toHaveAttribute('data-time', 'live');
  await expect.poll(() => nearMiddle(other, 10, 50), { timeout: 15_000 }).toBe(true);
  // The fragment is read once and cleared, so a reload does not restore it again.
  expect(await other.evaluate(() => window.location.hash)).toBe('');
  expect(otherProblems).toEqual([]);
  await fresh.close();
});
