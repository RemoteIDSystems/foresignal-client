import { expect, test, type Page } from '@playwright/test';
import { collectProblems } from './support';

/**
 * The RF / Sensors workspace (032). The local backend has no receivers or SatDump stations, so the
 * sensor discovery adds a stood-in station to the backend's own answer, and its polar plot (served
 * only during a live pass) and dossier are stand-ins; the RF layers, kinds and records are the
 * backend's.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

/** A 1×1 JPEG, as the polar plot stand-in. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

const STATION = {
  ref: 'sensor:station:satdump-e2e',
  type: 'sensor',
  title: 'SatDump E2E',
  summary: 'SatDump autotrack station',
  geometry: { type: 'Point', coordinates: [-95.36, 29.76] },
  provenance: { sourceIds: ['satdump-e2e'] },
  sensorKind: 'station',
  rangeKm: 2500,
  families: ['weather-imagery'],
};

async function standIns(page: Page) {
  await page.route(/\/v1\/sensors\?/, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { items: unknown[] };
    return route.fulfill({ response, json: { ...body, items: [STATION, ...body.items] } });
  });
  await page.route(/\/v1\/ground-stations\/satdump-e2e\/polarplot\.jpeg$/, (route) =>
    route.fulfill({ contentType: 'image/jpeg', body: JPEG }),
  );
  await page.route(/\/v1\/objects\/sensor%3Astation%3Asatdump-e2e\/dossier/, (route) =>
    route.fulfill({
      json: {
        ref: STATION.ref,
        envelope: STATION,
        generatedAt: new Date().toISOString(),
        sections: { overview: { status: 'ok', fields: { antenna: 'QFH' } } },
      },
    }),
  );
}

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
  await standIns(page);
});

test('the RF / Sensors tab: catalog, map and a selected sensor’s detail', async ({ page }) => {
  await page.goto('/global');
  await page.getByRole('link', { name: 'RF / Sensors' }).click();
  await expect(page).toHaveURL(/\/rf-sensors$/);
  await expect(page.getByRole('heading', { level: 1, name: 'RF / Sensors' })).toBeAttached();

  // The map, with the rail's RF / Spectrum layers.
  await expect(page.getByTestId('rf-map').locator('canvas').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'RF / Spectrum Layers' })).toBeVisible();

  // The catalog lists the backend's sensors over the view, stations first.
  const catalog = page.getByTestId('sensor-catalog');
  await expect(catalog.getByRole('button').first()).toHaveText('SatDump E2E');
  expect(await catalog.getByRole('button').count()).toBeGreaterThan(1);
  await page.getByRole('combobox', { name: 'Sensor kind' }).selectOption('station');
  await expect(catalog.getByRole('button')).toHaveCount(1);

  // The station's live polar plot, in the ground stations panel.
  const stations = page.getByTestId('ground-stations');
  await expect(stations.getByTestId('polarplot')).toHaveAttribute('data-state', 'ready');
  await expect(stations.getByRole('img', { name: /polar plot from SatDump E2E/ })).toBeVisible();

  // Selecting it shows its detail and moves the shared selection.
  await catalog.getByRole('button', { name: 'SatDump E2E' }).click();
  const detail = page.getByTestId('rf-detail');
  await expect(detail).toHaveAttribute('data-ref', 'sensor:station:satdump-e2e');
  await expect(detail).toContainText('SatDump autotrack station');
  await expect(detail.getByTestId('rf-facts')).toContainText('2,500 km');
  await expect(detail.getByTestId('rf-facts')).toContainText('QFH');
  expect(problems).toEqual([]);
});
