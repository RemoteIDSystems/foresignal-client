import { expect, test, type Page } from '@playwright/test';

/** The live earthquake style's icon color (usgs-earthquakes, `#D9480F`). */
const EARTHQUAKE_RGB: [number, number, number] = [0xd9, 0x48, 0x0f];

/** Records the map reports drawn for the enabled layers. */
async function drawn(page: Page): Promise<number> {
  return Number(await page.getByTestId('map-viewer').getAttribute('data-record-features'));
}

/** Waits until the map has drawn records (`some`) or none. */
async function waitForRecords(page: Page, some: boolean) {
  const count = expect.poll(() => drawn(page), { timeout: 60_000 });
  if (some) await count.toBeGreaterThan(0);
  else await count.toBe(0);
  // Let the frame with the change reach the screen.
  await page.waitForTimeout(1_500);
}

/**
 * Pixels on the map close to a color, counted in a real screenshot of the page: what a person
 * sees, not what the code says it drew. The screenshot is decoded in the page's own 2D canvas.
 */
async function pixelsNear(page: Page, [r, g, b]: [number, number, number]): Promise<number> {
  const box = await page.getByTestId('map-viewer').boundingBox();
  const png = (await page.screenshot({ clip: box ?? undefined })).toString('base64');
  return page.evaluate(
    async ({ png, r, g, b }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const near =
          Math.abs(data[i]! - r) <= 24 &&
          Math.abs(data[i + 1]! - g) <= 24 &&
          Math.abs(data[i + 2]! - b) <= 24;
        if (near) count++;
      }
      return count;
    },
    { png, r, g, b },
  );
}

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  const kinds = await request.get('/v1/kinds');
  expect(kinds.ok(), 'the backend must be running on http://localhost:8080').toBe(true);
  const live = (await kinds.json()) as { kind: string; currentCount: number }[];
  expect(
    live.find((kind) => kind.kind === 'earthquake')?.currentCount ?? 0,
    'these checks read the live earthquake layer, which must have records',
  ).toBeGreaterThan(0);
  await page.goto('/global');
  await page.locator('.cesium-widget canvas').waitFor();
});

for (const mode of ['2D Map', '3D Globe'] as const) {
  test(`toggling the earthquake layer shows and hides its records (${mode})`, async ({ page }) => {
    await page.getByRole('tab', { name: mode }).click();
    const toggle = page.locator('li[data-layer="earthquake"] input[type="checkbox"]');
    // On by default: the kind has records now.
    await expect(toggle).toBeChecked();
    await waitForRecords(page, true);
    const shown = await pixelsNear(page, EARTHQUAKE_RGB);
    expect(shown).toBeGreaterThan(200);

    await toggle.uncheck();
    await waitForRecords(page, false);
    const hidden = await pixelsNear(page, EARTHQUAKE_RGB);
    expect(hidden).toBeLessThan(shown / 10);
    await expect(page.getByTestId('legend-summary')).toHaveText(
      'No layers on. Turn one on in the Layers rail.',
    );

    await toggle.check();
    await waitForRecords(page, true);
    expect(await pixelsNear(page, EARTHQUAKE_RGB)).toBeGreaterThan(200);
    await expect(page.getByTestId('legend-summary')).toHaveText('1 kind on the map');
    // A switch to 3D once stopped Cesium rendering (camera read mid-morph); that is an error here.
    expect(problems).toEqual([]);
  });
}

test('zooming in requests deeper tiles, and a layer waits for its aggregation zoom', async ({
  page,
}) => {
  const requested: { layer: string; z: number }[] = [];
  page.on('request', (request) => {
    const match = /\/v1\/tiles\/([^/]+)\/(\d+)\/\d+\/\d+\.mvt/.exec(request.url());
    if (match) requested.push({ layer: match[1]!, z: Number(match[2]) });
  });
  await waitForRecords(page, true);
  // Aircraft aggregates below zoom 7 (the live TileJSON's `foresignal:aggBelowZoom`).
  const aircraft = page.locator('li[data-layer="aircraft"]');
  await aircraft.locator('input[type="checkbox"]').check();
  await expect(aircraft).toHaveAttribute('data-layer-state', 'aggregated');

  const deepest = (layer: string) =>
    Math.max(-1, ...requested.filter((r) => r.layer === layer).map((r) => r.z));
  let earthquakeZ = deepest('earthquake');
  for (let click = 0; click < 12; click++) {
    if ((await aircraft.getAttribute('data-layer-state')) !== 'aggregated') break;
    expect(deepest('aircraft'), 'nothing is requested below the aggregation zoom').toBe(-1);
    requested.length = 0;
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(2_500);
    // A step that keeps its whole zoom keeps its tiles; one that requests goes deeper, never back
    // to world tiles (as it once did when the 2D view rectangle read as the whole world).
    const z = deepest('earthquake');
    if (z >= 0) {
      expect(z).toBeGreaterThan(earthquakeZ);
      earthquakeZ = z;
    }
  }
  await expect(aircraft).not.toHaveAttribute('data-layer-state', 'aggregated');
  await expect.poll(() => deepest('aircraft'), { timeout: 30_000 }).toBeGreaterThanOrEqual(7);
  expect(requested.filter((r) => r.layer === 'aircraft' && r.z < 7)).toEqual([]);
  expect(earthquakeZ).toBeGreaterThanOrEqual(7);
  expect(problems).toEqual([]);
});
