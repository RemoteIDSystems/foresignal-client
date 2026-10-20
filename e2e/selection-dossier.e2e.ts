import { expect, test, type Page } from '@playwright/test';
import { standInQuakes } from './dense-support';
import {
  collectProblems,
  expectLiveEarthquakes,
  getBackend,
  kindToggle,
  openGlobal,
  waitForRecords,
} from './support';

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  await expectLiveEarthquakes(request);
});

/** Where a place shows on the page, through the map engine (development builds). */
async function screenOf(page: Page, longitude: number, latitude: number) {
  const canvas = (await page.locator('.cesium-widget canvas').boundingBox())!;
  const at = await page.evaluate(
    ({ longitude, latitude }) => window.__foresignalEngine?.toScreen(longitude, latitude),
    { longitude, latitude },
  );
  if (!at) throw new Error('the place is not on screen');
  return { x: canvas.x + at.x, y: canvas.y + at.y, canvas };
}

/** Moves the camera straight over a place, at a height, without a flight. */
async function lookAt(page: Page, longitude: number, latitude: number, height: number) {
  await page.evaluate(
    ({ longitude, latitude, height }) => {
      const { camera, scene } = window.__foresignalEngine!.viewer;
      const destination = scene.globe.ellipsoid.cartographicToCartesian({
        longitude: (longitude * Math.PI) / 180,
        latitude: (latitude * Math.PI) / 180,
        height,
      } as never);
      camera.setView({ destination });
    },
    { longitude, latitude, height },
  );
}

test('clicking a record opens its dossier from the backend, and a 2D-only item keeps the 2D map', async ({
  page,
  request,
}) => {
  // A live earthquake, from the backend itself.
  const records = (await (
    await getBackend(request, '/v1/records?kind=earthquake&limit=20')
  ).json()) as {
    items: { source: string; externalId: string; geometry: { coordinates: [number, number] } }[];
  };
  const quake = records.items.find((item) => item.geometry?.coordinates)!;
  const [longitude, latitude] = quake.geometry.coordinates;

  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  const map = page.getByTestId('map-viewer');
  await lookAt(page, longitude, latitude, 1_500_000);
  await waitForRecords(page, true);
  const at = await screenOf(page, longitude, latitude);
  await page.mouse.click(at.x, at.y);
  await expect(map).toHaveAttribute('data-selected', /^earthquake\|usgs-earthquakes\|/);
  // The record under the pointer (this quake or one drawn on top of it) is the one shown.
  const externalId = (await map.getAttribute('data-selected'))!.split('|')[2]!;
  const panel = page.getByTestId('entity-panel');
  await expect(panel).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await expect(panel).toHaveAttribute('data-ref', `record:usgs-earthquakes/${externalId}`);
  const envelope = (await (
    await getBackend(
      request,
      `/v1/objects/${encodeURIComponent(`record:usgs-earthquakes/${externalId}`)}`,
    )
  ).json()) as { title: string };
  await expect(page.getByTestId('entity-title')).toHaveText(envelope.title);
  await expect(panel).toContainText(`ID: ${externalId}`);
  await expect(page.getByTestId('entity-facts')).toContainText('Location');
  await expect(page.getByTestId('entity-facts')).toContainText('Last Update');
  // The live backend's recent updates (its versions) render; its empty sections say so.
  await expect(page.getByTestId('section-recent-updates')).toHaveAttribute('data-status', 'ok');
  await expect(page.getByTestId('section-recent-updates')).toContainText('Version');
  // An earthquake has no 3D view: the map stays 2D, and the record, already in view, stays put.
  await page.waitForTimeout(2_500);
  await expect(map).toHaveAttribute('data-scene-mode', '2d');
  const after = await screenOf(page, longitude, latitude);
  expect(Math.abs(after.x - at.x)).toBeLessThan(3);
  expect(Math.abs(after.y - at.y)).toBeLessThan(3);
  await page.screenshot({ path: 'review/014-dossier.png' });
  expect(problems).toEqual([]);
});

test('a 3D-applicable item switches to the globe and flies to it; an unavailable section shows its message', async ({
  page,
}) => {
  // A stand-in storm (it has a storm structure to show, so a 3D view) and a stand-in dossier for it.
  await standInQuakes(page, [
    {
      longitude: -97.5,
      latitude: 33.2,
      properties: {
        kind: 'cyclone',
        source: 'usgs-earthquakes',
        externalId: 'standin-storm',
        title: 'Stand-in Tropical Storm',
        observedAt: 1_792_500_000,
      },
    },
  ]);
  const ref = 'record:usgs-earthquakes/standin-storm';
  await page.route(/\/v1\/objects\/[^/]+\/dossier/, async (route) => {
    expect(decodeURIComponent(new URL(route.request().url()).pathname.split('/')[3]!)).toBe(ref);
    await route.fulfill({
      contentType: 'application/json',
      headers: { ETag: '"standin-1"' },
      body: JSON.stringify({
        ref,
        generatedAt: new Date().toISOString(),
        envelope: {
          ref,
          type: 'record',
          title: 'Stand-in Tropical Storm',
          status: 'active',
          time: { observedAt: new Date().toISOString() },
          geometry: { type: 'Point', coordinates: [-97.5, 33.2] },
          actions: [
            {
              id: 'track',
              label: 'Track',
              method: 'GET',
              href: '/v1/records/x/track',
              scope: 'read',
            },
            {
              id: 'add-to-workspace',
              method: 'POST',
              href: '/v1/workspaces/w/items',
              scope: 'read',
            },
            {
              id: 'annotate',
              label: 'Annotate',
              method: 'POST',
              href: '/v1/annotations',
              scope: 'read',
            },
          ],
        },
        sections: {
          overview: {
            status: 'ok',
            fields: { maxWind: 70, pressure: 986, movement: 'WNW at 12 kt' },
          },
          imagery: {
            status: 'unavailable',
            message: 'The imagery catalog did not answer in time.',
          },
          forecast: { status: 'empty', official: [], questions: [] },
          impacts: { status: 'not-installed' },
          related: { status: 'ok', nearby: [] },
          timeline: {
            status: 'ok',
            items: [{ at: new Date().toISOString(), kind: 'version', title: 'Version 12' }],
          },
          analysis: { status: 'empty' },
        },
      }),
    });
  });
  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  const map = page.getByTestId('map-viewer');
  await expect(map).toHaveAttribute('data-scene-mode', '2d');
  await lookAt(page, -90, 30, 6_000_000);
  await page.waitForTimeout(1_500);
  const at = await screenOf(page, -97.5, 33.2);
  await page.mouse.click(at.x, at.y);
  await expect(map).toHaveAttribute('data-selected', 'earthquake|usgs-earthquakes|standin-storm');
  // Contextual 3D: the scene switches to the globe and the camera flies to look down on it.
  await expect(map).toHaveAttribute('data-scene-mode', '3d');
  await expect
    .poll(() => page.evaluate(() => window.__foresignalEngine?.viewer.scene.mode), {
      timeout: 10_000,
    })
    .toBe(3);
  await page.waitForTimeout(3_000);
  const view = await page.evaluate(() => {
    const { camera } = window.__foresignalEngine!.viewer;
    return { height: camera.positionCartographic.height, pitch: (camera.pitch * 180) / Math.PI };
  });
  expect(view.height).toBeGreaterThan(1_000_000);
  expect(view.height).toBeLessThan(3_000_000);
  expect(view.pitch).toBeLessThan(-30);
  const centered = await screenOf(page, -97.5, 33.2);
  expect(Math.abs(centered.x - (centered.canvas.x + centered.canvas.width / 2))).toBeLessThan(40);
  expect(Math.abs(centered.y - (centered.canvas.y + centered.canvas.height / 2))).toBeLessThan(40);

  // The panel: the envelope's actions; the unavailable imagery's message while the rest render.
  const panel = page.getByTestId('entity-panel');
  await expect(panel).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('entity-title')).toHaveText('Stand-in Tropical Storm');
  await expect(page.getByTestId('entity-no-image')).toHaveText(
    'The imagery catalog did not answer in time.',
  );
  await expect(page.getByTestId('entity-facts')).toContainText('986');
  await expect(page.getByTestId('section-recent-updates')).toContainText('Version 12');
  const actions = page.getByTestId('entity-actions');
  await expect(actions.getByRole('button', { name: 'Track' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Add to Workspace' })).toBeVisible();
  await actions.getByRole('button', { name: 'More actions' }).click();
  await expect(actions.getByRole('button', { name: 'Annotate' })).toBeVisible();
  // A storm-like item shows the Forecast Track mini-map, from its track.
  await expect(page.getByTestId('forecast-track')).toBeVisible();
  await page.screenshot({ path: 'review/014-dossier-3d.png' });
  await page.getByRole('tab', { name: 'Impacts' }).click();
  await expect(page.getByTestId('section-impacts')).toHaveAttribute('data-status', 'not-installed');
  await expect(page.getByTestId('section-impacts')).toContainText('not installed on this server');
  await page.getByRole('tab', { name: 'Related (0)' }).click();
  expect(problems).toEqual([]);
});
