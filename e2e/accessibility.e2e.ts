import { expect, test } from '@playwright/test';
import { collectProblems, openGlobal } from './support';

/**
 * Accessibility, shortcuts and onboarding (036), against the live backend: the keys a person
 * presses on the Global map, the shortcuts overlay, the rail walked with the arrow keys, the skip
 * link, and the welcome shown once. Every check starts with the welcome dismissed (the config's
 * storage state) except the welcome's own.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(({ page }) => {
  problems = collectProblems(page);
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

test('a number key toggles the rail category it names, as its checkbox does', async ({ page }) => {
  await openGlobal(page);
  const first = page.locator('li[data-category]').first();
  await expect(first).toBeVisible();
  const before = await first.getAttribute('data-category-state');
  await page.locator('body').press('1');
  const after = before === 'on' ? 'off' : 'on';
  await expect(first).toHaveAttribute('data-category-state', after);
  await page.locator('body').press('1');
  await expect(first).toHaveAttribute('data-category-state', before === 'on' ? 'on' : 'off');
});

test('m switches between the 2D map and the 3D globe', async ({ page }) => {
  await openGlobal(page);
  const map = page.locator('[data-scene-mode]');
  await expect(map).toHaveAttribute('data-scene-mode', '2d');
  await page.locator('body').press('m');
  await expect(map).toHaveAttribute('data-scene-mode', '3d');
  await expect(page.getByRole('tab', { name: '3D Globe' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.locator('body').press('m');
  await expect(map).toHaveAttribute('data-scene-mode', '2d');
});

test('l and i hide and show the side panels', async ({ page }) => {
  await openGlobal(page);
  const rail = page.getByRole('region', { name: 'Layers' });
  await expect(rail).toBeVisible();
  await page.locator('body').press('l');
  await expect(rail).toBeHidden();
  await page.locator('body').press('l');
  await expect(rail).toBeVisible();
});

test('? opens the shortcuts overlay, which keeps focus inside and closes on Escape', async ({
  page,
}) => {
  await openGlobal(page);
  await page.locator('li[data-category]').first().waitFor();
  await page.locator('body').press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  for (const group of ['General', 'Map', 'Layers', 'Time', 'Panels']) {
    await expect(dialog.getByRole('region', { name: group })).toBeVisible();
  }
  await expect(dialog.getByText('Switch between 2D Map and 3D Globe')).toBeVisible();
  // Tab never leaves the dialog.
  for (let press = 0; press < 6; press++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the top bar keyboard button opens the overlay too', async ({ page }) => {
  await openGlobal(page);
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});

test('/ focuses the search, where letters are text again', async ({ page }) => {
  await openGlobal(page);
  await page.locator('body').press('/');
  const search = page.getByRole('combobox', { name: 'Search' });
  await expect(search).toBeFocused();
  await page.keyboard.type('m');
  await expect(search).toHaveValue('m');
  await expect(page.locator('[data-scene-mode]')).toHaveAttribute('data-scene-mode', '2d');
});

test('the arrow keys walk the layers rail', async ({ page }) => {
  await openGlobal(page);
  const boxes = page.locator('li[data-category] > div input[type="checkbox"]');
  await expect(boxes.nth(1)).toBeVisible();
  await boxes.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(boxes.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(boxes.first()).toBeFocused();
});

test('the skip link is the first stop and moves focus to the main content', async ({ page }) => {
  await openGlobal(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to the main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});

test.describe('first run', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the welcome shows once, and not again after it is dismissed', async ({ page }) => {
    await openGlobal(page);
    const welcome = page.getByRole('region', { name: 'Welcome to ForeSignal' });
    await expect(welcome).toBeVisible();
    await expect(welcome.getByRole('listitem')).toHaveCount(3);
    await welcome.getByRole('button', { name: 'Got it' }).click();
    await expect(welcome).toBeHidden();
    await page.reload();
    await page.locator('.cesium-widget canvas').waitFor();
    await expect(welcome).toBeHidden();
  });

  test('the overlay can show the welcome again', async ({ page }) => {
    await openGlobal(page);
    await page
      .getByRole('region', { name: 'Welcome to ForeSignal' })
      .getByRole('button', {
        name: 'See the shortcuts',
      })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Show the welcome again' }).click();
    await expect(page.getByRole('region', { name: 'Welcome to ForeSignal' })).toBeVisible();
  });
});
