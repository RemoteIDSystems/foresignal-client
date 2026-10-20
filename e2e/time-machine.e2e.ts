import { expect, test, type Page } from '@playwright/test';
import { standInQuakes } from './dense-support';
import {
  collectProblems,
  drawn,
  expectLiveEarthquakes,
  kindToggle,
  openGlobal,
  pixelsNear,
  waitForRecords,
} from './support';

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  await expectLiveEarthquakes(request);
});

/** Where a fraction of the scrubber's track is on the page. */
async function trackPoint(page: Page, fraction: number) {
  const box = (await page.getByTestId('time-scrubber').boundingBox())!;
  return { x: box.x + box.width * fraction, y: box.y + box.height - 4 };
}

/** Drags the scrubber's handle from Now to a fraction of the track and lets go. */
async function dragTo(page: Page, fraction: number) {
  const now = await trackPoint(page, 0.5);
  const to = await trackPoint(page, fraction);
  await page.mouse.move(now.x, now.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('dragging the scrubber pins the map at an instant, playback steps through frames, and Now resumes live', async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Every TileJSON and tile the page asks for, to see which instant each was for.
  const tileJsons: { url: string; template?: string }[] = [];
  const tiles: string[] = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (/\/v1\/tiles\/earthquake\.json/.test(url) && response.ok()) {
      const body = (await response.json().catch(() => undefined)) as
        { tiles?: string[] } | undefined;
      tileJsons.push({ url, template: body?.tiles?.[0] });
    }
    if (/\/v1\/tiles\/earthquake\/\d+\/\d+\/\d+\.mvt/.test(url)) tiles.push(url);
  });

  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  const map = page.getByTestId('map-viewer');
  const badge = page.getByTestId('live-state');
  await expect(map).toHaveAttribute('data-time', 'live');
  await expect(badge).toHaveAttribute('data-state', 'live');
  // The histogram of the last day for the drawn kinds.
  await expect
    .poll(async () => Number(await page.getByTestId('time-histogram').getAttribute('data-buckets')))
    .toBeGreaterThan(0);
  const live = await drawn(page);
  // The stream's connections so far: returning to live must not need a new one.
  const connections = await badge.getAttribute('data-connections');
  await page.screenshot({ path: 'review/013-live.png' });

  // Dragged back to −24h…−6h's middle (−15h): the map is pinned there.
  const before = tiles.length;
  await dragTo(page, 0.125);
  await expect(map).toHaveAttribute('data-time', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  const asOf = (await map.getAttribute('data-time'))!;
  const hoursBack = (Date.now() - Date.parse(asOf)) / 3_600_000;
  expect(hoursBack).toBeGreaterThan(13);
  expect(hoursBack).toBeLessThan(17);
  await expect(page.getByTestId('time-mode')).toHaveText('◆ HISTORY');
  await expect(page.getByTestId('hud-time')).toHaveText(
    `${asOf.slice(0, 10)} ${asOf.slice(11, 19)}Z`,
  );
  // The layer's TileJSON is read as of that instant, and its tiles are asked for with the
  // template it returned, not a time string the client made up.
  await expect.poll(() => tileJsons.find((read) => read.url.includes('asOf='))).toBeTruthy();
  const pinned = tileJsons.find((read) => read.url.includes('asOf='))!;
  const templateAsOf = new URL(pinned.template!, 'http://x').searchParams.get('asOf');
  expect(templateAsOf).toBe(asOf);
  await expect.poll(() => tiles.slice(before).length).toBeGreaterThan(0);
  for (const url of tiles.slice(before)) {
    expect(new URL(url).searchParams.get('asOf')).toBe(templateAsOf);
  }
  await waitForRecords(page, true);
  const paused = await drawn(page);
  await page.screenshot({ path: 'review/013-paused.png' });
  console.log(`Records drawn: live ${live}, as of ${asOf} ${paused}.`);

  // Playback: the keyframe, then each frame in order; the handle steps with it.
  await page.getByRole('button', { name: 'Play history' }).click();
  await expect(map).toHaveAttribute('data-playback', /^\d+\/\d+$/);
  const step = async () => Number((await map.getAttribute('data-playback'))?.split('/')[0]);
  await expect.poll(step, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  const position = Number(await page.getByTestId('time-scrubber').getAttribute('data-position'));
  await expect
    .poll(async () => Number(await page.getByTestId('time-scrubber').getAttribute('data-position')))
    .toBeGreaterThan(position);
  await page.getByRole('button', { name: 'Pause playback' }).click();
  const held = await step();
  await page.waitForTimeout(1_500);
  expect(await step()).toBe(held);
  // The frame's records are drawn with the same symbols as the tiles.
  expect(await drawn(page)).toBeGreaterThan(0);
  await expect(page.getByTestId('playback-step')).toContainText(`Frame ${held + 1} of`);
  await page.screenshot({ path: 'review/013-playback.png' });

  // Back to Now: live again on the same stream connection, with every tile fetched afresh.
  const afresh = tiles.length;
  await page.getByRole('button', { name: 'Return to live' }).click();
  await expect(map).toHaveAttribute('data-time', 'live');
  await expect(map).not.toHaveAttribute('data-playback');
  await expect(badge).toHaveAttribute('data-state', 'live');
  await expect(badge).toHaveAttribute('data-connections', connections!);
  await expect.poll(() => tiles.slice(afresh).length).toBeGreaterThan(0);
  for (const url of tiles.slice(afresh)) expect(new URL(url).searchParams.has('asOf')).toBe(false);
  await waitForRecords(page, true);
  expect(problems).toEqual([]);
});

test('a selected entity shows its trail up to the time cursor', async ({ page }) => {
  // One stand-in record off Florida, and a stand-in track for it: a curve to the north-east.
  await standInQuakes(page, [
    {
      longitude: -76.5,
      latitude: 28.4,
      properties: {
        kind: 'earthquake',
        source: 'usgs-earthquakes',
        externalId: 'standin0',
        title: 'M 6.1 - Stand-in quake off Florida',
        mag: 6,
        observedAt: 1_792_500_000,
      },
    },
  ]);
  const asked: string[] = [];
  await page.route(/\/v1\/records\/usgs-earthquakes\/standin0\/track/, async (route) => {
    asked.push(route.request().url());
    const coordinates = Array.from({ length: 12 }, (_, i) => [
      -84 + i * 0.7,
      22 + i * 0.6 - (i * i) / 40,
    ]);
    coordinates.push([-76.5, 28.4]);
    await route.fulfill({
      contentType: 'application/geo+json',
      body: JSON.stringify({
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates: [coordinates] },
        properties: {
          sourceId: 'usgs-earthquakes',
          externalId: 'standin0',
          kind: 'earthquake',
          from: '2026-10-20T06:00:00Z',
          to: '2026-10-20T12:00:00Z',
          times: [coordinates.map((_, i) => 1_792_500_000_000 + i * 60_000)],
          pointsReturned: coordinates.length,
          segments: 1,
          watermarkSeq: 1,
        },
      }),
    });
  });
  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  const map = page.getByTestId('map-viewer');
  const accent: [number, number, number] = [0x24, 0xa8, 0xfc];
  const without = await pixelsNear(page, accent);

  const canvas = (await page.locator('.cesium-widget canvas').boundingBox())!;
  const at = await page.evaluate(() => window.__foresignalEngine?.toScreen(-76.5, 28.4));
  await page.mouse.click(canvas.x + at!.x, canvas.y + at!.y);
  await expect(map).toHaveAttribute('data-selected', 'earthquake|usgs-earthquakes|standin0');
  await expect(map).toHaveAttribute('data-trail', '13');
  await page.waitForTimeout(2_000);
  // The trail is on the screen: accent pixels along it, which were not there before. The line is
  // thin and blends with the sea at its edges, so its solid core is what is counted.
  await page.screenshot({ path: 'review/013-trail.png' });
  const withTrail = await pixelsNear(page, accent);
  console.log(`Accent pixels: ${without} before the selection, ${withTrail} with its trail.`);
  expect(withTrail - without).toBeGreaterThan(40);
  // It ends at the time cursor: now while live, the pinned instant once pinned.
  const to = new URL(asked[0]!).searchParams.get('to')!;
  expect(Math.abs(Date.parse(to) - Date.now())).toBeLessThan(60_000);
  await dragTo(page, 0.375);
  await expect(map).toHaveAttribute('data-time', /Z$/);
  const asOf = (await map.getAttribute('data-time'))!;
  await expect.poll(() => asked.map((url) => new URL(url).searchParams.get('to'))).toContain(asOf);
  // Cleared with the selection.
  await page.keyboard.press('Escape');
  await expect(map).not.toHaveAttribute('data-trail');
  expect(problems).toEqual([]);
});
