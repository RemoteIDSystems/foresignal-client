import { expect, test } from '@playwright/test';
import {
  collectProblems,
  EARTHQUAKE_RGB,
  expectLiveEarthquakes,
  kindToggle,
  openGlobal,
  showLegend,
  pixelsNear,
  waitForRecords,
} from './support';

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  await expectLiveEarthquakes(request);
});

test('the rail opens grouped by category, with the mock’s categories on', async ({ page }) => {
  await openGlobal(page);
  await showLegend(page);
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
    await showLegend(page);
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
  await showLegend(page);
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
