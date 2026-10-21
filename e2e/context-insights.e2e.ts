import { expect, test, type Page } from '@playwright/test';
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

/** Moves the camera straight over a place, at a height, without a flight. */
async function lookAt(page: Page, longitude: number, latitude: number, height: number) {
  await page.evaluate(
    ({ longitude, latitude, height }) => {
      const { camera, scene } = window.__foresignalEngine!.viewer;
      camera.setView({
        destination: scene.globe.ellipsoid.cartographicToCartesian({
          longitude: (longitude * Math.PI) / 180,
          latitude: (latitude * Math.PI) / 180,
          height,
        } as never),
      });
    },
    { longitude, latitude, height },
  );
}

/** Where a place shows in the map canvas, or undefined when it is off screen. */
async function canvasPoint(page: Page, longitude: number, latitude: number) {
  return page.evaluate(
    ({ longitude, latitude }) => window.__foresignalEngine?.toScreen(longitude, latitude),
    { longitude, latitude },
  );
}

test('the panels follow the backend’s summary of the view, and ask again when the view moves', async ({
  page,
}) => {
  const bodies: { viewport: { bbox: number[] }; timeRange: { start: string } }[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/v1/context/summary')) {
      bodies.push(request.postDataJSON() as (typeof bodies)[number]);
    }
  });
  const answered = page.waitForResponse((response) =>
    response.url().endsWith('/v1/context/summary'),
  );
  await openGlobal(page);
  const generatedAt = ((await (await answered).json()) as { generatedAt: string }).generatedAt;
  // The local backend has no alerts, findings or forecasts: each panel says the view has none.
  const timeline = page.getByTestId('activity-timeline');
  await expect(timeline).toContainText('No activity in this view.');
  await expect(page.getByTestId('insights')).toContainText('No forecasts in this view.');
  await expect(page.getByTestId('insights-updated')).toHaveText(
    `Last Updated: ${generatedAt.slice(0, 10)} ${generatedAt.slice(11, 16)}Z`,
  );
  // The window is the 24 hours before now.
  const asked = bodies.at(-1)!;
  expect(Date.now() - Date.parse(asked.timeRange.start)).toBeGreaterThan(23.9 * 3_600_000);
  // Moving the map asks about the new view.
  const before = bodies.length;
  await lookAt(page, 135, -25, 4_000_000);
  await expect.poll(() => bodies.length, { timeout: 10_000 }).toBeGreaterThan(before);
  const moved = bodies.at(-1)!.viewport.bbox;
  expect(moved[0]! < 135 && moved[2]! > 135).toBe(true);
  expect(problems).toEqual([]);
});

test('activity and insights rows render as the backend gives them, and a row selects its object on the map', async ({
  page,
  request,
}) => {
  // A live earthquake, from the backend itself; the summary naming it is a stand-in, as the local
  // backend issues no alerts, findings or forecasts.
  const records = (await (
    await getBackend(request, '/v1/records?kind=earthquake&limit=20')
  ).json()) as {
    items: {
      source: string;
      externalId: string;
      title: string;
      geometry: { coordinates: [number, number] };
    }[];
  };
  const quake = records.items.find((item) => item.geometry?.coordinates)!;
  const [longitude, latitude] = quake.geometry.coordinates;
  const ref = `record:${quake.source}/${encodeURIComponent(quake.externalId)}`;
  // Its dossier is the backend's own, read here and handed to the page: the page's read can meet
  // the local backend's limit on anonymous requests while the map loads, and fail after retries.
  const dossier = (await (
    await getBackend(request, `/v1/objects/${encodeURIComponent(ref)}/dossier`)
  ).json()) as unknown;
  await page.route(
    (url) => url.pathname === `/v1/objects/${encodeURIComponent(ref)}/dossier`,
    (route) => route.fulfill({ json: dossier }),
  );
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  await page.route('**/v1/context/summary', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        context: {},
        generatedAt: new Date(now).toISOString(),
        cacheAgeSeconds: 0,
        layerCounts: [],
        activity: [
          {
            at: at(9),
            ref: 'alert:standin-1',
            type: 'alert',
            title: 'Port congestion rising',
            signalFamily: 'ais-loitering',
          },
          { at: at(2), ref, type: 'record', title: quake.title, signalFamily: 'seismic' },
          {
            at: at(30),
            ref: 'situation:standin-2',
            type: 'situation-change',
            title: 'Grid frequency anomaly',
            signalFamily: null,
          },
        ],
        insights: [
          {
            ref: 'question:standin-3',
            kind: 'forecast',
            title: 'Aftershock above M4 within 72 hours',
            probability: 0.72,
            estimativeTerm: 'likely',
            issuer: 'official',
            baseRate: 0.41,
            knowledgeCutoff: '2026-10-19',
            textOrigin: 'deterministic',
          },
          {
            ref: 'question:standin-4',
            kind: 'forecast',
            title: 'Port closure within 48 hours',
            probability: 0.18,
            estimativeTerm: 'unlikely',
            issuer: 'foresignal-ensemble',
          },
        ],
        related: [
          { ref: 'situation:standin-2', type: 'situation', title: 'Grid frequency anomaly' },
        ],
        narrative: null,
        truncated: false,
      }),
    }),
  );
  await openGlobal(page);
  // The timeline, newest first, each row with its time and family.
  const timeline = page.getByTestId('activity-timeline');
  const rows = timeline.getByRole('button');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(quake.title);
  await expect(rows.nth(0)).toContainText('Seismic');
  await expect(rows.nth(0)).toContainText(at(2).slice(11, 16));
  await expect(rows.nth(2)).toContainText('Situation Change');
  // The forecasts, numbered, with their basis, percent and ICD term.
  const insights = page.getByTestId('insights');
  await expect(insights.getByRole('listitem')).toHaveCount(2);
  await expect(insights).toContainText(
    'Issued by Official · base rate 41% · knowledge to 2026-10-19',
  );
  await expect(insights).toContainText('72%');
  await expect(insights).toContainText('Likely');
  await page.screenshot({ path: 'review/015-context-insights.png' });

  // With the earthquake layer on and the map away from the quake, a click on its row selects it, opens its dossier and brings it into view.
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  await lookAt(page, 20, 0, 3_000_000);
  await page.waitForTimeout(1_000);
  await rows.nth(0).click();
  const map = page.getByTestId('map-viewer');
  await expect(map).toHaveAttribute(
    'data-selected',
    `earthquake|${quake.source}|${quake.externalId}`,
  );
  const panel = page.getByTestId('entity-panel');
  await expect(panel).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await expect(panel).toHaveAttribute('data-ref', ref);
  const canvas = (await page.locator('.cesium-widget canvas').boundingBox())!;
  await expect
    .poll(
      async () => {
        const point = await canvasPoint(page, longitude, latitude);
        return point
          ? Math.max(Math.abs(point.x - canvas.width / 2), Math.abs(point.y - canvas.height / 2))
          : Infinity;
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(40);
  // The filter narrows the timeline to one family.
  await page.getByTestId('activity-filter').selectOption('Seismic');
  await expect(rows).toHaveCount(1);
  expect(problems).toEqual([]);
});
