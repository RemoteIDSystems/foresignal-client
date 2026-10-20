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

/** Where a place shows in the map canvas, or undefined when it is off screen. */
async function canvasPoint(page: Page, longitude: number, latitude: number) {
  return page.evaluate(
    ({ longitude, latitude }) => window.__foresignalEngine?.toScreen(longitude, latitude),
    { longitude, latitude },
  );
}

/** Two live earthquakes far apart, from the backend itself. */
async function twoQuakes(page: Page) {
  const records = (await (
    await getBackend(page.request, '/v1/records?kind=earthquake&limit=100')
  ).json()) as {
    items: {
      source: string;
      externalId: string;
      title: string;
      geometry: { coordinates: [number, number] };
    }[];
  };
  const placed = records.items.filter((item) => item.geometry?.coordinates);
  const first = placed[0]!;
  const second = placed.find(
    (item) => Math.abs(item.geometry.coordinates[0] - first.geometry.coordinates[0]) > 40,
  )!;
  expect(second, 'two live earthquakes at least 40° of longitude apart').toBeDefined();
  const ref = (item: typeof first) =>
    `record:${item.source}/${encodeURIComponent(item.externalId)}`;
  return { first, second, firstRef: ref(first), secondRef: ref(second) };
}

/** A stand-in view summary whose activity names one object, so its row selects it. */
async function activityNaming(page: Page, ref: string, title: string) {
  await page.route('**/v1/context/summary', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        context: {},
        generatedAt: new Date().toISOString(),
        cacheAgeSeconds: 0,
        layerCounts: [],
        activity: [
          { at: new Date().toISOString(), ref, type: 'record', title, signalFamily: 'seismic' },
        ],
        insights: [],
        related: [],
        truncated: false,
      }),
    }),
  );
}

test('a selection’s related entities come from its dossier; the live backend’s empty lists say so', async ({
  page,
}) => {
  const { first, firstRef } = await twoQuakes(page);
  await activityNaming(page, firstRef, first.title);
  // Dossier reads in flight at once, at most; and whether the full related list was asked for.
  const isDossier = (url: string) => /\/v1\/objects\/[^/]+\/dossier/.test(url);
  let inFlight = 0;
  let mostInFlight = 0;
  let dossierReads = 0;
  let listed = false;
  page.on('request', (request) => {
    if (/\/v1\/objects\/[^/]+\/related/.test(request.url())) listed = true;
    if (!isDossier(request.url())) return;
    dossierReads++;
    mostInFlight = Math.max(mostInFlight, ++inFlight);
  });
  const settle = (request: { url(): string }) => {
    if (isDossier(request.url())) inFlight--;
  };
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);
  await openGlobal(page);
  const panel = page.getByTestId('related-entities');
  await expect(panel).toContainText('Select an object to see what is related to it.');
  await page.getByTestId('activity-timeline').getByRole('button').first().click();
  await expect(panel).toHaveAttribute('data-ref', firstRef);
  await expect(page.getByTestId('entity-panel')).toHaveAttribute('data-state', 'ready');
  // The live backend relates nothing to an earthquake: the dossier's section is empty.
  await expect(panel).toContainText('No related objects for this object.');
  await expect(panel).toHaveAttribute('data-source', 'dossier');
  // The two panels shared their read: never two dossier reads at once (the selection's own read
  // comes first; the live stream may revalidate later). No listRelatedObjects call was needed.
  expect(dossierReads).toBeGreaterThanOrEqual(2);
  expect(mostInFlight).toBe(1);
  expect(listed).toBe(false);
  expect(problems).toEqual([]);
});

test('related rows show in their tabs, and a row selects its object and flies the map to it', async ({
  page,
}) => {
  const { first, second, firstRef, secondRef } = await twoQuakes(page);
  const [longitude, latitude] = second.geometry.coordinates;
  await activityNaming(page, firstRef, first.title);
  // The first quake's dossier stands in with related lists (the second quake nearby among them);
  // the second quake's dossier is the live backend's.
  await page.route(/\/v1\/objects\/[^/]+\/dossier/, async (route) => {
    const ref = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[3]!);
    if (ref !== firstRef) return route.fallback();
    const live = await route.fetch();
    const dossier = (await live.json()) as { sections: Record<string, unknown> };
    dossier.sections.related = {
      status: 'ok',
      nearby: [
        {
          relation: { type: 'near' },
          direction: 'out',
          object: { ref: secondRef, type: 'record', title: second.title, status: 'active' },
          distanceKm: 45,
        },
        {
          relation: { type: 'near' },
          direction: 'out',
          object: {
            ref: 'facility:standin-port',
            type: 'facility',
            title: 'Stand-in Port',
            status: 'congestion alert',
          },
          distanceKm: 120,
        },
      ],
      operational: [
        {
          relation: { type: 'member-of' },
          direction: 'out',
          object: {
            ref: 'situation:standin-1',
            type: 'situation',
            title: 'Stand-in Sequence',
            status: 'responding',
          },
        },
      ],
      infrastructure: [],
      historical: [
        {
          relation: { type: 'precedes', label: 'likely' },
          direction: 'in',
          object: { ref: 'record:standin/1989', type: 'record', title: 'M 6.9 in 1989' },
        },
      ],
    };
    await route.fulfill({
      response: live,
      json: dossier,
      headers: { ...live.headers(), etag: '"standin"' },
    });
  });
  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  await page.getByTestId('activity-timeline').getByRole('button').first().click();
  const panel = page.getByTestId('related-entities');
  await expect(panel).toHaveAttribute('data-ref', firstRef);
  const rows = panel.getByRole('button');
  await expect(rows).toHaveCount(2);
  await expect(panel).toHaveAttribute('data-counts', '2 1 0 1');
  await expect(rows.nth(0)).toContainText(second.title);
  await expect(rows.nth(0)).toContainText('45 km');
  await expect(rows.nth(1)).toContainText('Congestion Alert');
  await page.getByRole('tab', { name: 'Operational' }).click();
  await expect(panel).toContainText('Stand-in Sequence');
  await expect(panel).toContainText('Responding');
  await page.getByRole('tab', { name: 'Historical' }).click();
  await expect(panel).toContainText('Precedes (likely)');
  await page.getByRole('tab', { name: 'Nearby' }).click();
  await page.screenshot({ path: 'review/016-related-entities.png' });

  // A row selects its object (the second quake, live), and the map brings it to the middle.
  await rows.nth(0).click();
  const map = page.getByTestId('map-viewer');
  await expect(map).toHaveAttribute(
    'data-selected',
    `earthquake|${second.source}|${second.externalId}`,
  );
  await expect(page.getByTestId('entity-panel')).toHaveAttribute('data-ref', secondRef);
  await expect(page.getByTestId('entity-panel')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  });
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
  // The panel now shows the second quake's related objects, from its live dossier.
  await expect(panel).toHaveAttribute('data-ref', secondRef);
  await expect(panel).toContainText('No related objects for this object.');
  expect(problems).toEqual([]);
});
