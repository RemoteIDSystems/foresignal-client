import { expect, test, type Route } from '@playwright/test';
import { BAND13, frame, GOES_VIS, SCENE, TRUECOLOR } from '../src/imagery/testing/imageryFixtures';
import { collectProblems } from './support';

/**
 * Imagery (028). The local backend's imagery products are disabled and it holds no scenes, so the
 * catalog, the GOES frame and the scene are stand-ins, and the external provider's tiles are
 * answered here rather than fetched from it. Each stand-in picture is a solid color, so which side
 * of the swipe shows can be read from the screen.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

/** A solid 8 × 8 PNG of one color, drawn in the test's own browser. */
async function solidPng(route: Route, color: string) {
  const page = route.request().frame().page();
  const base64 = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d')!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 8, 8);
    return canvas.toDataURL('image/png').split(',')[1]!;
  }, color);
  return route.fulfill({ contentType: 'image/png', body: Buffer.from(base64, 'base64') });
}

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
  await page.route(/\/v1\/products(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [TRUECOLOR, BAND13, GOES_VIS], nextCursor: null } }),
  );
  await page.route(/\/v1\/products\/goes-east-vis\/frames\/latest/, (route) =>
    route.fulfill({ json: frame(new Date(Date.now() - 600_000).toISOString().slice(0, 19) + 'Z') }),
  );
  await page.route(/\/v1\/products\/goes-east-vis\/image\//, (route) => solidPng(route, '#3070c0'));
  await page.route(/\/v1\/sensors(\?.*)?$/, (route) =>
    route.fulfill({
      json: { from: '', to: '', items: [SCENE], note: 'Foresignal cannot task public satellites' },
    }),
  );
  // The provider's tiles: an older day red, a newer one green.
  await page.route(/gibs\.earthdata\.nasa\.gov/, (route) => {
    const day = /\/default\/([^/]+)\//.exec(route.request().url())?.[1] ?? '';
    const newest = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    return solidPng(route, day.startsWith(newest) ? '#20c040' : '#d03020');
  });
});

/** The red and green share of a screenshot of an element, as a person sees it. */
async function colorShares(page: import('@playwright/test').Page, testId: string) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  const png = (await page.screenshot({ clip: box })).toString('base64');
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i]! > 180 && pixels[i + 1]! < 90) red++;
      if (pixels[i + 1]! > 150 && pixels[i]! < 90) green++;
    }
    const total = pixels.length / 4;
    return { red: red / total, green: green / total };
  }, png);
}

test('recent imagery lists the view’s imagery and opens a full frame', async ({ page }) => {
  await page.goto('/imagery');
  const grid = page.getByRole('list', { name: 'Recent imagery' });
  await expect(grid.getByRole('button')).toHaveCount(4);
  await expect(grid.getByRole('button').first()).toContainText('GOES-East visible (ABI band 2)');
  // The backend frame is drawn from the client's fetch.
  const first = grid.getByRole('img', { name: 'GOES-East visible (ABI band 2)' });
  await expect(first).toHaveAttribute('src', /^blob:/);
  expect(await first.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  await page
    .getByRole('group', { name: 'Imagery filters' })
    .getByRole('button', { name: 'Thermal' })
    .click();
  await expect(grid.getByRole('button')).toHaveCount(1);
  await page
    .getByRole('group', { name: 'Imagery filters' })
    .getByRole('button', { name: 'All' })
    .click();

  await grid.getByRole('button').first().click();
  const viewer = page.getByRole('dialog', { name: 'GOES-East visible (ABI band 2)' });
  await expect(viewer.getByRole('img', { name: 'GOES-East visible (ABI band 2)' })).toHaveAttribute(
    'src',
    /^blob:/,
  );
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  expect(problems).toEqual([]);
});

test('the swipe compares two dates, and a drag moves it', async ({ page }) => {
  await page.goto('/imagery?tab=change');
  const swipe = page.getByTestId('swipe-compare');
  await expect(swipe).toBeVisible();
  // Before (left of the handle) is the older, red day; after is the newer, green one.
  await expect
    .poll(async () => (await colorShares(page, 'swipe-compare')).red)
    .toBeGreaterThan(0.3);
  const half = await colorShares(page, 'swipe-compare');
  expect(half.green).toBeGreaterThan(0.3);

  // A real drag to near the right edge shows nearly all of the before day.
  const box = (await swipe.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(swipe).toHaveAttribute('data-position', /^(8[5-9]|9[0-5])$/);
  const dragged = await colorShares(page, 'swipe-compare');
  expect(dragged.red).toBeGreaterThan(half.red + 0.2);

  await expect(page.getByTestId('change-metrics')).toContainText('Building count');
  await expect(page.getByRole('button', { name: /Run Change Detection/ })).toBeDisabled();
  expect(problems).toEqual([]);
});

test('the Satellite view ends its bottom row with imagery and the comparison', async ({ page }) => {
  await page.route(/\/compat\/celestrak\/gp\.php/, (route) =>
    route.fulfill({ contentType: 'text/plain', body: 'No GP data found' }),
  );
  await page.goto('/satellites');
  await expect(
    page
      .getByRole('region', { name: 'Recent imagery' })
      .getByRole('list', { name: 'Recent imagery' })
      .getByRole('button'),
  ).toHaveCount(4);
  await expect(
    page.getByRole('region', { name: 'Imagery comparison' }).getByTestId('swipe-compare'),
  ).toBeVisible();
  expect(problems).toEqual([]);
});
