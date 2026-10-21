import { expect, test, type Page } from '@playwright/test';
import {
  changes,
  eventMember,
  intelEvent,
  investigation,
  investigationEnvelope,
  INVESTIGATION_ID,
  member,
  situation,
  situationSummary,
  SITUATION_ID,
  timeline,
} from '../src/intel/testing/fixtures';
import { collectProblems } from './support';

/**
 * The full-analysis views (019). The local backend has no situations, and investigations always
 * need a token, so the situation and investigation reads are stand-ins (the 019 fixtures); the map,
 * its style, layers and tiles are the live backend's.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
});

/** Answers the situation reads with the fixtures. */
async function standInSituation(page: Page) {
  const base = `/v1/situations/${SITUATION_ID}`;
  await page.route(/\/v1\/situations(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [situationSummary], nextCursor: null } }),
  );
  await page.route(new RegExp(`${base}(\\?.*)?$`), (route) => route.fulfill({ json: situation }));
  await page.route(new RegExp(`${base}/members(\\?.*)?$`), (route) =>
    route.fulfill({ json: { items: [member, eventMember], nextCursor: null } }),
  );
  await page.route(new RegExp(`${base}/timeline(\\?.*)?$`), (route) =>
    route.fulfill({ json: { items: timeline, nextCursor: null } }),
  );
  await page.route(new RegExp(`${base}/changes(\\?.*)?$`), (route) =>
    route.fulfill({ json: changes }),
  );
  await page.route(/\/v1\/objects\/situation%3A[^/]+\/related/, (route) =>
    route.fulfill({ json: { ref: `situation:${SITUATION_ID}`, items: [] } }),
  );
  await page.route(new RegExp(`/v1/intel/events/${eventMember.ref}$`), (route) =>
    route.fulfill({ json: intelEvent }),
  );
}

/** Answers the investigation reads with the fixtures, and records the item changes. */
async function standInInvestigation(page: Page) {
  const changed: string[] = [];
  const base = `/v1/investigations/${INVESTIGATION_ID}`;
  await page.route(new RegExp(`${base}$`), (route) => route.fulfill({ json: investigation }));
  await page.route(/\/v1\/objects\/investigation%3A[^/]+$/, (route) =>
    route.fulfill({ json: investigationEnvelope }),
  );
  await page.route(/\/v1\/objects\/investigation%3A[^/]+\/related/, (route) =>
    route.fulfill({ json: { ref: `investigation:${INVESTIGATION_ID}`, items: [] } }),
  );
  await page.route(new RegExp(`${base}/items(/[^/]+)?$`), (route) => {
    changed.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.request().method() === 'DELETE'
      ? route.fulfill({ status: 204 })
      : route.fulfill({ status: 201, json: investigation.items![0] });
  });
  return changed;
}

test('a situation opens its full analysis from the Intelligence list, and its tabs populate', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await standInSituation(page);
  await page.goto('/intelligence');
  await page.getByRole('button', { name: /Northern California Seismic Swarm/ }).click();
  await expect(page).toHaveURL(new RegExp(`/intelligence/situations/${SITUATION_ID}`));

  const header = page.getByTestId('analysis-header');
  await expect(header.getByRole('heading', { level: 1 })).toHaveText(situation.title);
  await expect(header.getByRole('img', { name: 'Confidence 72% high' })).toBeVisible();
  await expect(page.getByTestId('what-changed')).toContainText('Status emerging → active');

  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByTestId('timeline-rows').getByRole('listitem')).toHaveCount(3);

  await page.getByRole('tab', { name: 'Entities (2)' }).click();
  await expect(page.getByRole('table', { name: 'Members' }).getByRole('row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Power outage near Santa Rosa' }).click();
  await expect(page.getByTestId('event-detail')).toContainText('Outage reports cluster');
  await page.getByRole('button', { name: 'Close event' }).click();

  // The Map tab flies to the situation's box and draws its member kinds' live layers.
  await page.getByRole('tab', { name: 'Map' }).click();
  const map = page.getByTestId('analysis-map');
  await map.locator('.cesium-widget canvas').waitFor();
  await expect(map.locator('[data-area="true"]')).toBeVisible();
  await expect(map.locator('[data-layers]')).toHaveAttribute('data-layers', /earthquake/);
  await expect(map.getByRole('button', { name: 'Disasters / Hazards' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The camera stops where the detailed basemap (038) is still sharp at its deepest level, not
  // where the NASA overview blurred: the wheel and the zoom button both hold the 2D map's span at
  // that limit, a few hundred meters for OpenStreetMap's level 19.
  await page.waitForFunction(() => window.__foresignalEngine !== undefined);
  const canvas = map.locator('.cesium-widget canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -600);
  for (let i = 0; i < 5; i++) await map.getByRole('button', { name: 'Zoom in' }).click();
  const span = () =>
    page.evaluate(() => {
      const { scene, camera } = window.__foresignalEngine!.viewer;
      const frustum = camera.frustum as unknown as { left: number; right: number };
      return {
        span: frustum.right - frustum.left,
        limit: scene.screenSpaceCameraController.minimumZoomDistance,
      };
    });
  await expect.poll(async () => (await span()).limit).toBeLessThan(1_000);
  expect((await span()).limit).toBeGreaterThan(10);
  await expect
    .poll(async () => {
      const { span: across, limit } = await span();
      return across >= limit - 1_000;
    })
    .toBe(true);
  await page.screenshot({ path: 'review/019-situation.png' });
  expect(problems).toEqual([]);
});

test('an investigation opens its workspace, lists its items, and adds and removes one', async ({
  page,
}) => {
  const changed = await standInInvestigation(page);
  await page.goto(`/intelligence/investigations/${INVESTIGATION_ID}`);
  const header = page.getByTestId('analysis-header');
  await expect(header).toContainText('ID: INV-2026-0001');
  await expect(page.getByTestId('investigation-overview')).toContainText('Items (2)');

  await page.getByRole('tab', { name: 'Items (2)' }).click();
  await expect(page.getByRole('table', { name: 'Items' }).getByRole('row')).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Item reference' }).fill('usgs-earthquakes/nc2');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect.poll(() => changed).toContain(`POST /v1/investigations/${INVESTIGATION_ID}/items`);
  await page.getByRole('button', { name: 'Remove “M 4.6 - 10 km NE of The Geysers”' }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect
    .poll(() => changed)
    .toContain(`DELETE /v1/investigations/${INVESTIGATION_ID}/items/item-1`);

  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByTestId('timeline-rows').getByRole('listitem')).toHaveCount(2);
  await page.screenshot({ path: 'review/019-investigation.png' });
  expect(problems).toEqual([]);
});
