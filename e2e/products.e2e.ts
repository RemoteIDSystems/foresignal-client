import { expect, test, type Page } from '@playwright/test';
import { collectProblems, openCategory, openGlobal } from './support';
import { LOOP_FRAMES, standInProducts } from './products-support';

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  const products = await request.get('/v1/products?limit=1');
  expect(products.ok(), 'the backend must be running on http://localhost:8080').toBe(true);
  await standInProducts(page, request);
});

/** The product layers the map reports drawn. */
async function drawnProducts(page: Page): Promise<string[]> {
  const value = await page.getByTestId('map-viewer').getAttribute('data-product-layers');
  return (value ?? '').split(' ').filter(Boolean);
}

/** A screenshot of the map, decoded in the page: its RGBA pixels and size. */
async function mapPixels(page: Page): Promise<{ data: number[]; width: number }> {
  const box = await page.getByTestId('map-viewer').boundingBox();
  const png = (await page.screenshot({ clip: box ?? undefined })).toString('base64');
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      data: Array.from(context.getImageData(0, 0, image.width, image.height).data),
      width: image.width,
    };
  }, png);
}

/** Pixels of a screenshot that pass a test of their color. */
function count(data: number[], test: (r: number, g: number, b: number) => boolean): number {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (test(data[i]!, data[i + 1]!, data[i + 2]!)) n++;
  return n;
}

/** Pixels that differ between two screenshots of the same size. */
function changed(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) >
      60
    )
      n++;
  }
  return n;
}

/** Saturated color: radar echoes, never the basemap, the clouds or the panels. */
const ECHO = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b) > 140;

/**
 * The mean position, in pixels, of the pixels in the middle of the map that pass a test of their
 * color.
 */
function centroid(
  { data, width }: { data: number[]; width: number },
  test: (r: number, g: number, b: number) => boolean,
): [number, number] {
  let [x, y, n] = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % width;
    // The middle of the map, clear of the legend (left) and the controls (right).
    if (px < width * 0.35 || px > width * 0.85) continue;
    if (!test(data[i]!, data[i + 1]!, data[i + 2]!)) continue;
    x += px;
    y += Math.floor(i / 4 / width);
    n++;
  }
  return [x / n, y / n];
}

/** Strong red: the 50–60 dBZ bands, through the layer's opacity. */
const RED = (r: number, g: number, b: number) => r > 140 && g < 70 && b < 70;
/** Strong green: the 20–30 dBZ bands. */
const GREEN = (r: number, g: number, b: number) => g > 120 && r < 90 && b < 90;

test('the default weather products draw over the basemap, with their legends', async ({ page }) => {
  await openGlobal(page);
  // The curated defaults: the mock's Weather row is checked.
  await expect
    .poll(() => drawnProducts(page), { timeout: 60_000 })
    .toEqual(expect.arrayContaining(['goes-east-ir', 'mrms-reflectivity']));
  await page.waitForTimeout(4_000);

  // The legend is the backend's: one band per live stop, in its colors and units.
  const live = (await (await page.request.get('/v1/products/mrms-reflectivity/legend')).json()) as {
    stops: { color: string }[];
  };
  const block = page.locator('section[data-product="mrms-reflectivity"]');
  const bands = block.locator('[data-bar="bands"] i');
  await expect(bands).toHaveCount(live.stops.length);
  const colors = await bands.evaluateAll((items) =>
    items.map((item) => getComputedStyle(item).backgroundColor),
  );
  const asRgb = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`;
  };
  expect(colors).toEqual(live.stops.map((stop) => asRgb(stop.color)));
  await expect(block).toContainText('dBZ');
  await expect(
    page.locator('section[data-product="goes-east-ir"] [data-bar="gradient"]'),
  ).toBeVisible();

  // What a person sees: the radar's red and green bands, gone when the product is turned off.
  const on = (await mapPixels(page)).data;
  const [red, green] = [count(on, RED), count(on, GREEN)];
  await openCategory(page, 'Weather');
  await page.locator('li[data-product="mrms-reflectivity"] input[type="checkbox"]').uncheck();
  await expect.poll(() => drawnProducts(page)).not.toContain('mrms-reflectivity');
  await page.waitForTimeout(2_000);
  const off = (await mapPixels(page)).data;
  console.log(
    `radar on: ${red} red and ${green} green pixels; off: ${count(off, RED)} and ${count(off, GREEN)}`,
  );
  expect(red - count(off, RED)).toBeGreaterThan(200);
  expect(green - count(off, GREEN)).toBeGreaterThan(500);
  // Its attribution goes with it, from the product's own structured attribution.
  expect(problems).toEqual([]);
});

test('a weather product animates through its loop, dropping expired frames', async ({ page }) => {
  const loops: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/v1/products/loop?')) loops.push(request.url());
  });
  await openGlobal(page);
  await expect.poll(() => drawnProducts(page), { timeout: 60_000 }).toContain('mrms-reflectivity');
  await page.waitForTimeout(4_000);
  // Where the tiles put the storm, to compare with where the loop's images put it: two paths
  // (Web Mercator tiles, and one re-projected image per frame) that must agree.
  const tiles = centroid(await mapPixels(page), ECHO);
  await page.getByRole('button', { name: 'Play the MRMS composite reflectivity loop' }).click();
  const block = page.locator('section[data-product="mrms-reflectivity"]');
  await expect(block).toHaveAttribute('data-loop-state', 'playing', { timeout: 60_000 });
  // The expired frame is dropped.
  await expect(block.getByTestId('loop-frame')).toContainText(`of ${LOOP_FRAMES}`);
  // Over the committed viewport, never wider than the backend allows.
  const asked = new URL(loops[loops.length - 1]!);
  expect(asked.searchParams.get('products')).toBe('mrms-reflectivity');
  expect(asked.searchParams.get('bbox')).toMatch(/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/);
  expect(Number(asked.searchParams.get('width'))).toBeLessThanOrEqual(1024);

  // The frames turn: the shown index moves, and so do the pixels. Screenshots are taken in a row
  // until two differ (a frame shows for half a second, and the newest is held for two).
  const index = async () => Number(await block.getAttribute('data-loop-index'));
  const first = await index();
  await expect.poll(index, { timeout: 10_000 }).not.toBe(first);
  const shot = await mapPixels(page);
  const looped = centroid(shot, ECHO);
  const apart = Math.hypot(tiles[0] - looped[0], tiles[1] - looped[1]);
  console.log(
    `storm at ${tiles.map(Math.round)} from tiles, ${looped.map(Math.round)} in the loop`,
  );
  expect(apart).toBeLessThan(30);
  let previous = shot.data;
  let moved = 0;
  for (let tries = 0; tries < 6 && moved <= 500; tries++) {
    await page.waitForTimeout(600);
    const next = (await mapPixels(page)).data;
    moved = changed(previous, next);
    previous = next;
  }
  console.log(`loop: ${moved} pixels changed between frames`);
  expect(moved).toBeGreaterThan(500);

  // Stopping shows the newest frame's tiles again.
  await page.getByRole('button', { name: 'Stop the MRMS composite reflectivity loop' }).click();
  await expect(block).toHaveAttribute('data-loop-state', 'off');
  expect(problems).toEqual([]);
});

test('wind draws as a speed raster, as barbs, and as moving particles', async ({ page }) => {
  // Software WebGL draws the particles slowly, and this check turns on three layers in turn.
  test.setTimeout(240_000);
  await openGlobal(page);
  await page.getByRole('button', { name: 'Turn all off' }).click();
  await expect.poll(() => drawnProducts(page)).toEqual([]);
  await page.waitForTimeout(2_000);
  const bare = (await mapPixels(page)).data;

  await openCategory(page, 'Weather');
  const row = page.locator('li[data-product="gfs"]');
  await row.locator('input[type="checkbox"]').check();
  // A wind field's checkbox turns on its speed raster and its particles.
  await expect
    .poll(() => drawnProducts(page), { timeout: 60_000 })
    .toEqual(['gfs', 'gfs:particles']);
  await page.waitForTimeout(3_000);
  // Particles move: two screenshots a moment apart differ.
  const a = (await mapPixels(page)).data;
  await page.waitForTimeout(400);
  const b = (await mapPixels(page)).data;
  const raster = changed(bare, a);
  const moving = changed(a, b);
  console.log(
    `wind: speed raster changed ${raster} pixels; particles moved ${moving} between frames`,
  );
  expect(raster).toBeGreaterThan(10_000);
  expect(moving).toBeGreaterThan(300);
  await expect(page.locator('section[data-product="gfs"]')).toContainText(
    'Particles move with the wind',
  );

  // Barbs: white glyphs, with the raster and particles turned off to see them alone.
  await row.getByRole('button', { name: 'Barbs' }).click();
  await row.getByRole('button', { name: 'Particles' }).click();
  await row.getByRole('button', { name: 'Speed' }).click();
  await expect.poll(() => drawnProducts(page), { timeout: 60_000 }).toEqual(['gfs:barbs']);
  await page.waitForTimeout(3_000);
  const barbs = changed(bare, (await mapPixels(page)).data);
  console.log(`barbs: ${barbs} pixels changed from the bare map`);
  expect(barbs).toBeGreaterThan(1_000);
  await expect(
    page.locator('section[data-product="gfs"]').getByLabel('Wind barbs in knots'),
  ).toBeVisible();
  expect(problems).toEqual([]);
});
