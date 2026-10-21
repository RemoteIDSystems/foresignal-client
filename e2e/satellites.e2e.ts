import { expect, test, type Page } from '@playwright/test';
import { GOES, ISS, SENTINEL, SENTINEL_SENSOR } from '../src/satellites/testing/satelliteFixtures';
import { collectProblems } from './support';

/**
 * Satellite Operations (027). The local backend's `celestrak-gp` source is off, so the element
 * sets are stand-ins (three satellites, by group); SGP4 runs in the browser and Cesium draws them.
 * The sensors and records are stand-ins too.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

/** Element sets by CelesTrak group. */
const GROUPS: Record<string, unknown[]> = {
  stations: [ISS],
  weather: [GOES],
  resource: [SENTINEL],
};

const NORADS = [ISS.NORAD_CAT_ID, GOES.NORAD_CAT_ID, SENTINEL.NORAD_CAT_ID];

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
  await page.route(/\/compat\/celestrak\/gp\.php/, (route) => {
    const group = new URL(route.request().url()).searchParams.get('GROUP') ?? '';
    return GROUPS[group]
      ? route.fulfill({ json: GROUPS[group] })
      : route.fulfill({ contentType: 'text/plain', body: 'No GP data found' });
  });
  await page.route(/\/v1\/sensors(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        from: new Date().toISOString(),
        to: new Date(Date.now() + 86_400_000).toISOString(),
        items: [
          {
            ...SENTINEL_SENSOR,
            passes: [
              {
                aos: new Date(Date.now() + 3_600_000).toISOString(),
                los: new Date(Date.now() + 3_960_000).toISOString(),
                maxElevationDeg: 62.4,
              },
            ],
          },
        ],
        note: 'Foresignal cannot task public satellites or third-party sensors',
      },
    }),
  );
  await page.route(/\/v1\/records\?kind=satellite/, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
});

/** The first satellite drawn inside the canvas, with where it is; undefined while none is. */
async function satelliteOnScreen(page: Page) {
  return page.evaluate((norads) => {
    const canvas = document.querySelector('.cesium-widget canvas')!.getBoundingClientRect();
    for (const norad of norads) {
      const at = window.__foresignalSatellites?.screenOf(norad);
      if (at && at.x > 20 && at.y > 20 && at.x < canvas.width - 20 && at.y < canvas.height - 20) {
        return { norad, x: canvas.left + at.x, y: canvas.top + at.y };
      }
    }
    return undefined;
  }, NORADS);
}

test('the constellation renders, animates with the clock, and a satellite selects', async ({
  page,
}) => {
  await page.goto('/satellites');
  const constellation = page.getByTestId('constellation');
  await expect(constellation).toHaveAttribute('data-satellites', '3');
  await expect(constellation.locator('.cesium-widget canvas')).toBeVisible();
  expect(await page.evaluate(() => window.__foresignalSatellites?.count)).toBe(3);

  // Live: the clock runs, and the scrubber's readout follows it.
  const first = await constellation.getAttribute('data-clock');
  await expect.poll(() => constellation.getAttribute('data-clock')).not.toBe(first);

  // Six hours ahead on the scrubber moves the Cesium clock there; LIVE brings it back.
  await page.getByRole('slider', { name: 'Hours from now' }).fill('6');
  await expect
    .poll(
      async () => Date.parse((await constellation.getAttribute('data-clock')) ?? '') - Date.now(),
    )
    .toBeGreaterThan(5.5 * 3_600_000);
  await page.getByRole('button', { name: '● LIVE' }).click();
  await expect
    .poll(async () =>
      Math.abs(Date.parse((await constellation.getAttribute('data-clock')) ?? '') - Date.now()),
    )
    .toBeLessThan(60_000);

  // A real click on a drawn satellite selects it. On the globe all three may be behind the Earth,
  // so the camera is put above the first, as a person would turn the globe to it.
  expect(
    await page.evaluate((norad) => window.__foresignalSatellites!.view(norad), NORADS[0]!),
  ).toBe(true);
  await expect.poll(() => satelliteOnScreen(page), { timeout: 15_000 }).toBeDefined();
  const target = (await satelliteOnScreen(page))!;
  await page.mouse.click(target.x, target.y);
  await expect(constellation).toHaveAttribute('data-selected-satellite', String(target.norad));
  const panel = page.getByRole('complementary', { name: 'Selected satellite' });
  await expect(panel.getByTestId('satellite-facts')).toContainText(`NORAD ID${target.norad}`);
  await expect(panel.getByTestId('next-pass')).not.toBeEmpty();

  // The passes over the view are listed.
  await expect(page.getByTestId('pass-table')).toContainText('SENTINEL-2A');
  expect(problems).toEqual([]);
});

test('the constellation opens on the 3D globe, and the Global map keeps its own mode', async ({
  page,
}) => {
  await page.goto('/satellites');
  const map = page.getByTestId('constellation').locator('[data-scene-mode]');
  await expect(map).toHaveAttribute('data-scene-mode', '3d');
  await page.getByRole('link', { name: 'Global' }).click();
  await expect(page.locator('[data-scene-mode]')).toHaveAttribute('data-scene-mode', '2d');
});
