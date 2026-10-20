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

/** How far a place is from the middle of the map canvas, in pixels (Infinity off screen). */
async function offCenter(page: Page, longitude: number, latitude: number) {
  const canvas = (await page.locator('.cesium-widget canvas').boundingBox())!;
  const at = await page.evaluate(
    ({ longitude, latitude }) => window.__foresignalEngine?.toScreen(longitude, latitude),
    { longitude, latitude },
  );
  return at
    ? Math.max(Math.abs(at.x - canvas.width / 2), Math.abs(at.y - canvas.height / 2))
    : Infinity;
}

/** A live earthquake far from the map's opening view, from the backend itself. */
async function farQuake(page: Page) {
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
  // The map opens over North America: one outside it moves the map for sure.
  const quake =
    placed.find((item) => Math.abs(item.geometry.coordinates[0] + 95) > 50) ?? placed[0]!;
  return {
    quake,
    ref: `record:${quake.source}/${encodeURIComponent(quake.externalId)}`,
    longitude: quake.geometry.coordinates[0],
    latitude: quake.geometry.coordinates[1],
  };
}

test('anonymous, search and Ask say they need a token; the find bar moves the map to a country and to coordinates', async ({
  page,
}) => {
  await openGlobal(page);
  // Search: the live backend refuses an anonymous search (it always needs a token), and its
  // search status says semantic search is not ready, so text search would be used.
  const status = (await (await getBackend(page.request, '/v1/search/status')).json()) as {
    semanticEnabled: boolean;
    reason: string | null;
  };
  await page.getByRole('combobox', { name: 'Search' }).fill('earthquake');
  const results = page.getByTestId('search-results');
  await expect(results.getByRole('alert')).toHaveText(
    'Search needs an access token, even with open reads. Add one in Settings.',
  );
  if (!status.semanticEnabled) {
    await expect(page.getByTestId('search-mode')).toHaveText(`Text search: ${status.reason}`);
  }
  await page.keyboard.press('Escape');

  // Ask, from the rail's tools: refused without a token, the question kept.
  await page.getByRole('button', { name: 'Ask ForeSignal' }).click();
  const ask = page.getByTestId('ask-panel');
  await ask.getByRole('textbox', { name: 'Question' }).fill('What shook today?');
  await ask.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(ask.getByRole('alert')).toHaveText(
    'Ask needs an access token, even with open reads. Add one in Settings.',
  );
  await expect(ask.getByRole('textbox', { name: 'Question' })).toHaveValue('What shook today?');
  await ask.getByRole('button', { name: 'Earlier questions' }).click();
  await expect(ask.getByRole('alert')).toContainText('needs an access token');
  await ask.getByRole('button', { name: 'Close Ask ForeSignal' }).click();

  // The find bar: a country from the backend's reference table, then typed coordinates.
  const countries = (await (await getBackend(page.request, '/v1/reference/countries')).json()) as {
    iso2: string;
    labelLon: number;
    labelLat: number;
  }[];
  const japan = countries.find((country) => country.iso2 === 'JP')!;
  const find = page.getByRole('combobox', { name: 'Find a place or coordinates' });
  await find.fill('Japan');
  await page.getByRole('option', { name: /Japan/ }).click();
  await expect
    .poll(() => offCenter(page, japan.labelLon, japan.labelLat), { timeout: 10_000 })
    .toBeLessThan(5);
  const height = await page.evaluate(
    () => window.__foresignalEngine!.viewer.camera.positionCartographic.height,
  );
  expect(Math.abs(height - 3_000_000)).toBeLessThan(50_000);
  await find.fill('33.9S 151.2E');
  await find.press('Enter');
  await expect.poll(() => offCenter(page, 151.2, -33.9), { timeout: 10_000 }).toBeLessThan(5);
  // The browser logs the backend's three refusals (search, the Ask stream, the thread list); they
  // are what this check asks for. Nothing else may go wrong.
  const refused = /^Failed to load resource: the server responded with a status of 401\b/;
  expect(problems.filter((problem) => refused.test(problem))).toHaveLength(3);
  expect(problems.filter((problem) => !refused.test(problem))).toEqual([]);
});

test('a search result selects its object and centers the map on it; an answer’s citation does too', async ({
  page,
}) => {
  const { quake, ref, longitude, latitude } = await farQuake(page);
  // Search and Ask need a token the local setup does not have: their answers stand in, naming
  // a live earthquake, whose dossier is the backend's own.
  await page.route('**/v1/search?**', (route) =>
    route.fulfill({
      json: {
        mode: 'text',
        degraded: false,
        items: [
          {
            docType: 'record',
            docId: quake.externalId,
            score: 0.92,
            title: quake.title,
            snippet: `<b>Earthquake</b> ${quake.title}`,
            kind: 'earthquake',
            source: quake.source,
            record: { source: quake.source, externalId: quake.externalId },
            geometry: { type: 'Point', coordinates: [longitude, latitude] },
          },
          {
            docType: 'alert',
            docId: 'standin-1',
            score: 0.4,
            title: 'Stand-in shaking alert',
            snippet: 'Strong shaking reported',
          },
        ],
      },
    }),
  );
  const cited = {
    id: `${quake.source}:${quake.externalId}`,
    seq: 1,
    title: quake.title,
    type: 'record',
  };
  await page.route('**/v1/ask/stream', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: [
        ['progress', { tool: 'search_records', status: 'calling', summary: 'Searching records…' }],
        ['delta', { text: 'The strongest was ' }],
        ['citation', cited],
        [
          'done',
          {
            threadId: '6f1c4a73-0000-4000-8000-000000000001',
            answer: `The strongest was [${cited.id}@1].`,
            citations: [cited],
            proposedActions: [],
          },
        ],
      ]
        .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        .join(''),
    }),
  );
  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);

  // Search: the grouped results; picking the record selects it and the map centers on it.
  await page.getByRole('combobox', { name: 'Search' }).fill('earthquake');
  const results = page.getByTestId('search-results');
  await expect(results).toHaveAttribute('data-state', 'ready');
  await expect(results.getByRole('heading')).toHaveText(['Records (1)', 'Alerts (1)']);
  await page.screenshot({ path: 'review/017-search.png' });
  await results
    .getByRole('option', { name: new RegExp(quake.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .click();
  const map = page.getByTestId('map-viewer');
  await expect(map).toHaveAttribute(
    'data-selected',
    `earthquake|${quake.source}|${quake.externalId}`,
  );
  await expect(page.getByTestId('entity-panel')).toHaveAttribute('data-ref', ref);
  await expect
    .poll(() => offCenter(page, longitude, latitude), { timeout: 10_000 })
    .toBeLessThan(40);

  // Ask: the streamed answer cites the quake. With the selection cleared and the map moved away,
  // its chip selects the quake again and brings the map back to it.
  await page.getByRole('combobox', { name: 'Search' }).press('Escape');
  await page.locator('.cesium-widget canvas').focus();
  await page.keyboard.press('Escape');
  await expect(map).not.toHaveAttribute('data-selected', /./);
  await page.evaluate(() => {
    const { camera, scene } = window.__foresignalEngine!.viewer;
    camera.setView({
      destination: scene.globe.ellipsoid.cartographicToCartesian({
        longitude: (20 * Math.PI) / 180,
        latitude: 0,
        height: 6_000_000,
      } as never),
    });
  });
  expect(await offCenter(page, longitude, latitude)).toBeGreaterThan(40);
  await page.getByRole('button', { name: 'Ask ForeSignal' }).click();
  const ask = page.getByTestId('ask-panel');
  await ask
    .getByRole('textbox', { name: 'Question' })
    .fill('What was the strongest earthquake today?');
  await ask.getByRole('textbox', { name: 'Question' }).press('Enter');
  const answer = ask.getByTestId('ask-answer');
  await expect(answer).toHaveAttribute('data-state', 'done');
  await expect(answer).toContainText(`The strongest was ${quake.title}.`);
  await page.screenshot({ path: 'review/017-ask.png' });
  await answer.getByRole('button', { name: quake.title }).click();
  await expect(map).toHaveAttribute(
    'data-selected',
    `earthquake|${quake.source}|${quake.externalId}`,
  );
  await expect
    .poll(() => offCenter(page, longitude, latitude), { timeout: 10_000 })
    .toBeLessThan(40);
  expect(problems).toEqual([]);
});
