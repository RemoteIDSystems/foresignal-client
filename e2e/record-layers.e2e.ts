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

/** Opens a category of the rail, if it is not open, so its kinds' rows show. */
async function openCategory(page: Page, label: string) {
  const toggle = page.getByRole('button', {
    name: new RegExp(`^(Show|Hide) the kinds in ${label.replace(/[()]/g, '\\$&')}$`),
  });
  // Waits for the rail to list the category; then opens it unless it is open.
  if ((await toggle.getAttribute('aria-label'))?.startsWith('Show')) await toggle.click();
}

/** A kind's checkbox in the rail, its category opened first. */
async function kindToggle(page: Page, category: string, kind: string) {
  await openCategory(page, category);
  return page.locator(`li[data-layer="${kind}"] input[type="checkbox"]`);
}

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
});

/** Opens the Global dashboard and waits for the map. */
async function openGlobal(page: Page) {
  await page.goto('/global');
  await page.locator('.cesium-widget canvas').waitFor();
}

test('the rail opens grouped by category, with the mock’s categories on', async ({ page }) => {
  await openGlobal(page);
  const state = (id: string) =>
    page.locator(`li[data-category="${id}"]`).getAttribute('data-category-state');
  for (const id of ['events', 'weather', 'infrastructure']) expect(await state(id)).toBe('on');
  // Earthquakes sit under Disasters / Hazards, which the mock shows unchecked.
  expect(await state('hazards')).toBe('off');
  await expect(page.locator('li[data-layer]')).toHaveCount(0);
  await expect(page.getByTestId('legend-summary')).toHaveText(
    'The layers that are on have no records right now.',
  );
  expect(problems).toEqual([]);
});

for (const mode of ['2D Map', '3D Globe'] as const) {
  test(`toggling the earthquake layer shows and hides its records (${mode})`, async ({ page }) => {
    await openGlobal(page);
    await page.getByRole('tab', { name: mode }).click();
    const toggle = await kindToggle(page, 'Disasters / Hazards', 'earthquake');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await waitForRecords(page, true);
    const shown = await pixelsNear(page, EARTHQUAKE_RGB);
    expect(shown).toBeGreaterThan(200);
    await expect(page.getByTestId('legend-summary')).toHaveText('1 kind on the map');

    await toggle.uncheck();
    await waitForRecords(page, false);
    const hidden = await pixelsNear(page, EARTHQUAKE_RGB);
    expect(hidden).toBeLessThan(shown / 10);
    await expect(page.getByTestId('legend-summary')).toHaveText(
      'The layers that are on have no records right now.',
    );

    await toggle.check();
    await waitForRecords(page, true);
    expect(await pixelsNear(page, EARTHQUAKE_RGB)).toBeGreaterThan(200);
    // A switch to 3D once stopped Cesium rendering (camera read mid-morph); that is an error here.
    expect(problems).toEqual([]);
  });
}

test('hiding a source in Filters takes its records off the map, and Show all brings them back', async ({
  page,
}) => {
  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  const shown = await pixelsNear(page, EARTHQUAKE_RGB);

  await page.getByRole('tab', { name: 'Filters' }).click();
  await page.locator('li[data-source="usgs-earthquakes"] input[type="checkbox"]').uncheck();
  await waitForRecords(page, false);
  expect(await pixelsNear(page, EARTHQUAKE_RGB)).toBeLessThan(shown / 10);
  await expect(page.getByTestId('legend-summary')).toHaveText(
    'The layers that are on have no records right now.',
  );

  await page.getByRole('button', { name: 'Show all' }).click();
  await waitForRecords(page, true);
  expect(await pixelsNear(page, EARTHQUAKE_RGB)).toBeGreaterThan(200);
  expect(problems).toEqual([]);
});

test('zooming in requests deeper tiles, and a layer waits for its aggregation zoom', async ({
  page,
}) => {
  // Only kinds with records are drawn, and live aircraft has none, so `listKinds` is given one
  // aircraft record here; its tiles still come from the backend (empty), which is what is watched.
  await page.route('**/v1/kinds', async (route) => {
    const response = await route.fetch();
    const kinds = (await response.json()) as { kind: string; currentCount: number }[];
    const others = kinds.filter((kind) => kind.kind !== 'aircraft');
    await route.fulfill({
      response,
      json: [...others, { kind: 'aircraft', currentCount: 1, sources: ['adsbfi-mil'] }],
    });
  });
  const requested: { layer: string; z: number }[] = [];
  page.on('request', (request) => {
    const match = /\/v1\/tiles\/([^/]+)\/(\d+)\/\d+\/\d+\.mvt/.exec(request.url());
    if (match) requested.push({ layer: match[1]!, z: Number(match[2]) });
  });
  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  // Aircraft aggregates below zoom 7 (the live TileJSON's `foresignal:aggBelowZoom`).
  await (await kindToggle(page, 'Aircraft (ADS-B)', 'aircraft')).check();
  const aircraft = page.locator('li[data-layer="aircraft"]');
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
