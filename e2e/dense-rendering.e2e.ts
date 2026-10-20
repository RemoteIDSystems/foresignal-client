import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DENSE_KINDS, POINTS_PER_KIND, standInCatalog, standInQuakes } from './dense-support';
import {
  collectProblems,
  expectLiveEarthquakes,
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
  return { x: canvas.x + at.x, y: canvas.y + at.y };
}

const QUAKES = [
  { longitude: -76.5, latitude: 28.4, title: 'M 6.1 - Stand-in quake off Florida' },
  { longitude: -90, latitude: 24, title: 'M 3.2 - Stand-in quake in the Gulf' },
  { longitude: -66, latitude: 17, title: 'M 5.0 - Stand-in quake off Puerto Rico' },
].map((quake, i) => ({
  longitude: quake.longitude,
  latitude: quake.latitude,
  properties: {
    kind: 'earthquake',
    source: 'usgs-earthquakes',
    externalId: `standin${i}`,
    title: quake.title,
    mag: 6 - i,
    observedAt: 1_792_500_000,
  },
}));

test('records are picked from the drawn tiles on hover and click, and marked as the mock marks them', async ({
  page,
}) => {
  await standInQuakes(page, QUAKES);
  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  const map = page.getByTestId('map-viewer');
  await expect(map).toHaveAttribute('data-record-features', String(QUAKES.length));

  const florida = await screenOf(page, -76.5, 28.4);
  await page.mouse.move(florida.x + 3, florida.y - 2);
  await expect(map).toHaveAttribute('data-hovered', 'earthquake|usgs-earthquakes|standin0');
  await expect(page.getByTestId('hover-marker')).toContainText(
    'M 6.1 - Stand-in quake off Florida',
  );
  await expect(map).toHaveCSS('cursor', 'pointer');

  await page.mouse.click(florida.x, florida.y);
  await expect(map).toHaveAttribute('data-selected', 'earthquake|usgs-earthquakes|standin0');
  const marker = page.getByTestId('selection-marker');
  await expect(marker).toContainText('M 6.1 - Stand-in quake off Florida');
  await expect(marker).toContainText('Earthquake · usgs-earthquakes');
  // The hover callout gives way to the selection's.
  await expect(page.getByTestId('hover-marker')).toHaveCount(0);
  // The box sits around the quake on screen: proven from where the browser laid it out.
  const box = (await marker.locator('div').first().boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - florida.x)).toBeLessThan(3);
  expect(Math.abs(box.y + box.height / 2 - florida.y)).toBeLessThan(3);
  await page.mouse.move(florida.x + 200, florida.y + 120);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'review/010-selection.png' });

  // Another record replaces the selection; the empty sea clears it; so does Escape.
  const gulf = await screenOf(page, -90, 24);
  await page.mouse.click(gulf.x, gulf.y);
  await expect(map).toHaveAttribute('data-selected', 'earthquake|usgs-earthquakes|standin1');
  await page.mouse.click(florida.x + 200, florida.y + 120);
  await expect(map).not.toHaveAttribute('data-selected');
  await page.mouse.click(gulf.x, gulf.y);
  await expect(map).toHaveAttribute('data-selected', /standin1/);
  await page.keyboard.press('Escape');
  await expect(map).not.toHaveAttribute('data-selected');

  // Cesium's own click (a GPU pick and entity selection) is gone, so a double click does not fly.
  const height = () =>
    page.evaluate(() => window.__foresignalEngine?.viewer.camera.positionCartographic.height);
  const before = (await height())!;
  await page.mouse.dblclick(gulf.x, gulf.y);
  await page.waitForTimeout(1_500);
  expect((await height())!).toBeCloseTo(before, 0);
  expect(problems).toEqual([]);
});

/** What the harness measured, from its result element. */
async function measure(page: Page) {
  await page.getByRole('button', { name: /^Measure/ }).click();
  const result = page.getByTestId('stress-result');
  await expect(page.getByRole('button', { name: /^Measure/ })).toBeEnabled({ timeout: 60_000 });
  return JSON.parse((await result.textContent())!) as {
    totals: { layers: number; features: number; cells: number; tiles: number; instances: number };
    frames: {
      fps: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
      slow: number;
      frames: number;
    };
    mode: string;
    toggle?: { layer: string; off: { ms: number }; on: { ms: number }; redrawnMs: number };
  };
}

/** Waits until every layer has loaded its view and the merged primitives are built. */
async function settled(page: Page, layers: number) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const engine = window.__foresignalEngine;
          if (!engine) return 'no engine';
          const totals = engine.layers.totals();
          const requests = engine.layers.requests;
          return `${totals.layers} ${totals.loading + requests.active + requests.waiting} ${totals.building}`;
        }),
      { timeout: 240_000, intervals: [1_000] },
    )
    .toBe(`${layers} 0 false`);
}

test('the full catalog at world zoom, dense layers aggregated, stays interactive', async ({
  page,
  request,
}) => {
  test.setTimeout(420_000);
  // The backend rate limits anonymous clients; the map waits and asks again (429 is expected).
  let rateLimited = 0;
  page.on('response', (response) => {
    if (response.status() === 429) rateLimited++;
  });
  const kinds = await standInCatalog(page, request);
  await page.goto('/global?stress');
  await page.locator('.cesium-widget canvas').waitFor();
  const harness = page.getByTestId('stress-harness');
  await expect(harness).toBeVisible();

  /** Switches the map's mode and moves to the whole world once the morph is done. */
  const toMode = async (mode: '2D Map' | '3D Globe', layers: number) => {
    await page.getByRole('tab', { name: mode }).click();
    await page.waitForTimeout(1_500);
    await harness.getByRole('button', { name: 'World view' }).click();
    await settled(page, layers);
    await page.waitForTimeout(2_000);
  };

  /** The layers that drew nothing (their style draws no points, or they are aggregated). */
  const silentLayers = () =>
    page.evaluate(() =>
      Object.entries(window.__foresignalEngine!.layers.counts())
        .filter(([, n]) => n === 0)
        .map(([id]) => id),
    );

  // Baseline: no record layers, the 2D map at world zoom.
  await page.getByRole('button', { name: 'Turn all off' }).click();
  await harness.getByRole('button', { name: 'World view' }).click();
  await settled(page, 0);
  await page.waitForTimeout(2_000);
  const empty = await measure(page);

  // Every kind, from the same view.
  await harness.getByRole('button', { name: 'World view' }).click();
  await harness.getByRole('button', { name: `Turn on all ${kinds.length} kinds` }).click();
  const start = Date.now();
  await settled(page, kinds.length);
  const loadSeconds = (Date.now() - start) / 1000;
  await page.waitForTimeout(2_000);
  const silent = await silentLayers();
  await page.screenshot({ path: 'review/010-stress-full-catalog.png' });
  const full = await measure(page);

  // The same on the 3D globe, then the globe with no record layers.
  await toMode('3D Globe', kinds.length);
  await page.screenshot({ path: 'review/010-stress-full-catalog-3d.png' });
  const globe = await measure(page);
  await page.getByRole('button', { name: 'Turn all off' }).click();
  await settled(page, 0);
  await page.waitForTimeout(2_000);
  const emptyGlobe = await measure(page);

  const summary = {
    silent,
    gpu: process.env.E2E_GPU === '1',
    kinds: kinds.length,
    dense: DENSE_KINDS.length,
    pointsPerKind: POINTS_PER_KIND,
    loadSeconds,
    rateLimited,
    empty,
    full,
    emptyGlobe,
    globe,
  };
  console.log(JSON.stringify(summary));
  writeFileSync(
    `test-results/010-stress-${summary.gpu ? 'gpu' : 'software'}.json`,
    JSON.stringify(summary, null, 2),
  );

  expect(full.totals.layers).toBe(kinds.length);
  // The stand-in kinds whose style draws points (others draw lines or areas, which these points
  // are not) are drawn one by one, every point of each; the dense kinds as cells.
  const drawing = kinds.length - silent.length;
  expect(drawing).toBeGreaterThan(100);
  expect(full.totals.features).toBeGreaterThanOrEqual((drawing - 1) * POINTS_PER_KIND);
  for (const kind of DENSE_KINDS) expect(silent).toContain(kind);
  expect(full.totals.cells).toBeGreaterThan(0);
  // Turning one layer off and on is a few ms of work, and it draws again from memory quickly.
  expect(full.toggle!.off.ms).toBeLessThan(50);
  expect(full.toggle!.on.ms).toBeLessThan(50);
  // The redraw is seen frame by frame: allow a few of the slowest frames (software WebGL's are
  // seconds long).
  expect(full.toggle!.redrawnMs).toBeLessThan(2_000 + 3 * full.frames.max);
  // Every layer drew in the end, rate limited or not.
  expect(silent.toSorted()).toEqual(DENSE_KINDS.toSorted());
  if (summary.gpu) {
    // Guards against a regression such as a primitive per layer or per tile: the 3D globe keeps
    // most of its empty rate, and the 2D map (every symbol in view, twice across the wrap) stays
    // above 10 frames a second with every kind on.
    expect(globe.frames.fps).toBeGreaterThan(30);
    expect(full.frames.fps).toBeGreaterThan(10);
  } else {
    // In software WebGL (SwiftShader) every fragment of some 25,000 symbols is drawn on the CPU,
    // which no batching changes; here the check is that the map still renders.
    expect(full.frames.frames).toBeGreaterThan(0);
  }
  // The browser logs each rate-limited response; anything else is a problem.
  expect(problems.filter((problem) => !problem.includes('status of 429'))).toEqual([]);
});
