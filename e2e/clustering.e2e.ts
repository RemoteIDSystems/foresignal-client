import { expect, test, type Page } from '@playwright/test';
import { CLUSTER_POINT_BUDGET } from '../src/map/records/clientClusters';
import type { DrawnTotals } from '../src/map/records/recordLayerSet';
import { standInCatalog } from './dense-support';

/**
 * Client-side clustering (037). The whole catalog is turned on with stand-in records (as the 035
 * scale check does): at world zoom the layers the backend does not aggregate draw their points as
 * the client's cells, merged across the layers; zooming in past the cluster zoom
 * (`CLIENT_CLUSTER_BELOW_ZOOM`, 7)
 * draws records again, and zooming out draws cells again. Every frame of both crossings is checked
 * to show points or cells, never neither (no blink). A click on a cell zooms into it.
 */

/** The world over the central United States. */
const WORLD = { longitude: -95, latitude: 38, height: 20_000_000 };
/** About zoom 8.4 on the 2D map at the e2e viewport: past the cluster zoom. */
const NEAR = { longitude: -95, latitude: 38, height: 400_000 };

/** Moves the camera over a place, flying for `seconds`, or at once with 0. */
async function moveTo(page: Page, at: typeof WORLD, seconds: number) {
  await page.evaluate(
    ({ at, seconds }) => {
      const { camera, scene } = window.__foresignalEngine!.viewer;
      const here = camera.positionCartographic.clone();
      here.longitude = (at.longitude * Math.PI) / 180;
      here.latitude = (at.latitude * Math.PI) / 180;
      here.height = at.height;
      const destination = scene.globe.ellipsoid.cartographicToCartesian(here);
      if (seconds === 0) camera.setView({ destination });
      else camera.flyTo({ destination, duration: seconds });
    },
    { at, seconds },
  );
}

/** What the map's record layers draw now. */
function totals(page: Page): Promise<DrawnTotals> {
  return page.evaluate(() => window.__foresignalEngine!.layers.totals());
}

/** Waits until nothing is loading or building. */
async function settled(page: Page) {
  await expect
    .poll(
      async () => {
        const now = await totals(page);
        return now.loading === 0 && !now.building;
      },
      { timeout: 240_000, intervals: [1_000] },
    )
    .toBe(true);
}

/**
 * Records, at every frame, the points and cell instances the map shows. Returns the function that
 * stops and hands back the samples.
 */
async function watchShown(page: Page): Promise<() => Promise<number[]>> {
  await page.evaluate(() => {
    const at = window as unknown as { shown: number[]; shownFrame: number };
    at.shown = [];
    const tick = () => {
      const now = window.__foresignalEngine!.layers.totals();
      at.shown.push(now.pointsShown + now.cellsShown);
      at.shownFrame = requestAnimationFrame(tick);
    };
    at.shownFrame = requestAnimationFrame(tick);
  });
  return () =>
    page.evaluate(() => {
      const at = window as unknown as { shown: number[]; shownFrame: number };
      cancelAnimationFrame(at.shownFrame);
      return at.shown;
    });
}

/** Turns the whole catalog on, with stand-in records, and opens the world view settled. */
async function wholeCatalogAtWorld(page: Page, request: Parameters<typeof standInCatalog>[1]) {
  const kinds = await standInCatalog(page, request);
  await page.goto('/global?stress');
  await page.locator('.cesium-widget canvas').waitFor();
  await page.waitForFunction(() => window.__foresignalEngine !== undefined);
  const harness = page.getByTestId('stress-harness');
  await harness.getByRole('button', { name: `Turn on all ${kinds.length} kinds` }).click();
  await moveTo(page, WORLD, 0);
  await settled(page);
}

test('the whole catalog clusters at world zoom, and crossing the cluster zoom never blinks', async ({
  page,
  request,
}) => {
  test.setTimeout(900_000);
  await wholeCatalogAtWorld(page, request);
  const world = await totals(page);
  expect(world.cells).toBeGreaterThan(0);
  expect(world.aggregated).toBeGreaterThan(CLUSTER_POINT_BUDGET);
  expect(world.features).toBeLessThanOrEqual(CLUSTER_POINT_BUDGET);
  expect(world.cellsShown).toBeGreaterThan(0);

  // In, past the cluster zoom: records again, and every frame shows something.
  let stop = await watchShown(page);
  await moveTo(page, NEAR, 2);
  await expect
    .poll(async () => (await totals(page)).features, { timeout: 120_000 })
    .toBeGreaterThan(0);
  await settled(page);
  let shown = await stop();
  expect(shown.length).toBeGreaterThan(30);
  expect(Math.min(...shown)).toBeGreaterThan(0);
  const near = await totals(page);
  expect(near.pointsShown).toBeGreaterThan(0);

  // Back out to the world: cells again, and again no frame shows neither.
  stop = await watchShown(page);
  await moveTo(page, WORLD, 2);
  await expect
    .poll(async () => (await totals(page)).aggregated, { timeout: 240_000 })
    .toBeGreaterThan(CLUSTER_POINT_BUDGET);
  await settled(page);
  shown = await stop();
  expect(shown.length).toBeGreaterThan(30);
  expect(Math.min(...shown)).toBeGreaterThan(0);
});

test('a click on a cell zooms into it', async ({ page, request }) => {
  test.setTimeout(900_000);
  await wholeCatalogAtWorld(page, request);
  // The live earthquakes of Northern California are always in a cell at world zoom.
  const at = await page.evaluate(() => window.__foresignalEngine!.toScreen(-122.8, 38.8));
  expect(at).toBeDefined();
  const canvas = page.locator('.cesium-widget canvas');
  const box = (await canvas.boundingBox())!;
  const height = () =>
    page.evaluate(() => window.__foresignalEngine!.viewer.camera.positionCartographic.height);
  const before = await height();
  await page.mouse.click(box.x + at!.x, box.y + at!.y);
  await expect.poll(height, { timeout: 10_000 }).toBeLessThan(before / 4);
  // A cell is zoomed into, not selected.
  await expect(page.getByTestId('map-viewer')).not.toHaveAttribute('data-selected', /.+/);
});
