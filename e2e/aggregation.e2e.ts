import { expect, test, type Page } from '@playwright/test';
import {
  collectProblems,
  drawn,
  drawnCells,
  expectLiveEarthquakes,
  kindToggle,
  openGlobal,
  standInDense,
  waitForRecords,
} from './support';

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  await expectLiveEarthquakes(request);
});

/** The earthquake count in the rail (its category open), once it counts the records in view. */
async function earthquakesInView(page: Page): Promise<number> {
  const badge = page.locator('li[data-layer="earthquake"] [data-count-scope="view"]');
  return Number((await badge.innerText()).replace(/,/g, ''));
}

/** One record tile request: its layer, zoom and `agg`. */
interface TileRequest {
  layer: string;
  z: number;
  agg: string | null;
}

/** Records every record tile the page requests. */
function watchTiles(page: Page): TileRequest[] {
  const requested: TileRequest[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    const match = /\/v1\/tiles\/([^/]+)\/(\d+)\/\d+\/\d+\.mvt$/.exec(url.pathname);
    if (match) {
      requested.push({ layer: match[1]!, z: Number(match[2]), agg: url.searchParams.get('agg') });
    }
  });
  return requested;
}

test('zooming in turns hexagon counts into records past the aggregation zoom, and back', async ({
  page,
}) => {
  await standInDense(page);
  const requested = watchTiles(page);
  await openGlobal(page);
  await (await kindToggle(page, 'Disasters / Hazards', 'earthquake')).check();
  await waitForRecords(page, true);
  const aircraft = page.locator('li[data-layer="aircraft"]');
  await (await kindToggle(page, 'Aircraft (ADS-B)', 'aircraft')).check();
  await expect(aircraft).toHaveAttribute('data-layer-state', 'aggregated', { timeout: 30_000 });
  await expect.poll(() => drawnCells(page), { timeout: 30_000 }).toBeGreaterThan(0);
  const ofAircraft = () => requested.filter((r) => r.layer === 'aircraft');
  // Below zoom 7: hexagon tiles only.
  expect(ofAircraft().length).toBeGreaterThan(0);
  expect(ofAircraft().every((r) => r.agg === 'hex' && r.z < 7)).toBe(true);

  const deepest = (layer: string) =>
    Math.max(-1, ...requested.filter((r) => r.layer === layer).map((r) => r.z));
  let earthquakeZ = deepest('earthquake');
  for (let click = 0; click < 14; click++) {
    if ((await aircraft.getAttribute('data-layer-state')) === 'ready') break;
    requested.length = 0;
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(2_500);
    // A step that keeps its whole zoom keeps its tiles; one that requests goes deeper, never back
    // to world tiles (as it once did when the 2D view rectangle read as the whole world).
    const z = deepest('earthquake');
    if (z >= 0) {
      expect(z).toBeGreaterThan(earthquakeZ);
      earthquakeZ = z;
    }
    // Every earthquake in view is drawn: the tiles cover the view, so the map draws at least as
    // many as the summary counts in it. (Points once went missing after a zoom step, refused by
    // the outgoing zoom's tiles.)
    await expect
      .poll(async () => (await drawn(page)) - (await earthquakesInView(page)), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(0);
  }
  // Past zoom 7: record tiles, never below it, and the cells are gone.
  await expect(aircraft).toHaveAttribute('data-layer-state', 'ready', { timeout: 30_000 });
  await expect
    .poll(() => ofAircraft().filter((r) => r.agg === 'none').length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  expect(ofAircraft().filter((r) => r.agg === 'none' && r.z < 7)).toEqual([]);
  await expect.poll(() => drawnCells(page), { timeout: 30_000 }).toBe(0);
  expect(earthquakeZ).toBeGreaterThanOrEqual(7);

  // Back out toward the world: hexagons again. Just below zoom 7 the view may hold no cells (it
  // is wherever the zoom steps landed), so it zooms out until some are drawn.
  for (let click = 0; click < 14; click++) {
    if (
      (await aircraft.getAttribute('data-layer-state')) === 'aggregated' &&
      (await drawnCells(page)) > 0
    )
      break;
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.waitForTimeout(2_500);
  }
  await expect(aircraft).toHaveAttribute('data-layer-state', 'aggregated', { timeout: 30_000 });
  await expect.poll(() => drawnCells(page), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(ofAircraft().filter((r) => r.agg === 'hex' && r.z >= 7)).toEqual([]);
  expect(problems).toEqual([]);
});

test('the rail counts the records in view, from the viewport summary', async ({ page }) => {
  const summaries: number[][] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/v1/context/summary')) {
      summaries.push((request.postDataJSON() as { viewport: { bbox: number[] } }).viewport.bbox);
    }
  });
  await openGlobal(page);
  const hazards = page.locator('li[data-category="hazards"] [data-count-scope]');
  await expect(hazards).toHaveAttribute('data-count-scope', 'view', { timeout: 30_000 });
  const count = async () => Number((await hazards.innerText()).replace(/,/g, ''));
  const atStart = await count();
  const live = (await (await page.request.get('/v1/kinds')).json()) as {
    kind: string;
    currentCount: number;
  }[];
  const anywhere = live.find((kind) => kind.kind === 'earthquake')?.currentCount ?? 0;
  expect(atStart).toBeGreaterThan(0);
  expect(atStart).toBeLessThanOrEqual(anywhere);

  // Zoomed in, the summary is asked about a smaller box, and counts fewer.
  const before = summaries.length;
  for (let click = 0; click < 4; click++) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(800);
  }
  await expect.poll(() => summaries.length, { timeout: 30_000 }).toBeGreaterThan(before);
  const [first, last] = [summaries[0]!, summaries[summaries.length - 1]!];
  const width = (bbox: number[]) => (bbox[2]! - bbox[0]! + 360) % 360 || 360;
  expect(width(last)).toBeLessThan(width(first));
  await expect.poll(count, { timeout: 30_000 }).toBeLessThan(atStart);
  expect(problems).toEqual([]);
});

/** Frames the page draws per second over a stretch, while the map is panned back and forth. */
async function framesPerSecond(page: Page, ms = 5_000): Promise<number> {
  const box = (await page.getByTestId('map-viewer').boundingBox())!;
  const counting = page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number) => {
          frames++;
          if (now - start < duration) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (now - start));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  const end = Date.now() + ms;
  // Each drag lets go away from where it pressed, so it is a pan, never a click (a click makes
  // Cesium pick, which is its own cost).
  for (let way = 1; Date.now() < end; way = -way) {
    const from = x - way * 75;
    await page.mouse.move(from, y);
    await page.mouse.down();
    await page.mouse.move(from + way * 150, y + way * 40, { steps: 10 });
    await page.mouse.up();
  }
  return counting;
}

test('the map stays interactive with several dense layers on at world zoom', async ({ page }) => {
  const dense = [
    'aircraft',
    'vessel',
    'satellite',
    'fire-detection',
    'news-article',
    'social-post',
  ];
  await standInDense(page, dense);
  await openGlobal(page);
  // The defaults include Events (news-article and social-post); turn them off for the baseline.
  await page.getByRole('button', { name: 'Turn all off' }).click();
  await page.waitForTimeout(3_000);
  const baseline = await framesPerSecond(page);

  for (const [category, kind] of [
    ['Aircraft (ADS-B)', 'aircraft'],
    ['Maritime (AIS)', 'vessel'],
    ['Satellite Orbits', 'satellite'],
    ['Disasters / Hazards', 'fire-detection'],
    ['Events', 'news-article'],
    ['Events', 'social-post'],
  ] as const) {
    await (await kindToggle(page, category, kind)).check();
  }
  await expect.poll(() => drawnCells(page), { timeout: 60_000 }).toBeGreaterThan(300);
  await page.waitForTimeout(3_000);
  const loaded = await framesPerSecond(page);
  const cells = await drawnCells(page);
  console.log(
    `frame rate: ${baseline.toFixed(1)} fps with no layers, ${loaded.toFixed(1)} fps with ` +
      `${dense.length} aggregated layers (${cells} cells)`,
  );
  if (process.env.E2E_GPU === '1') {
    // On the GPU: interactive outright, and most of the empty map's rate kept.
    expect(loaded).toBeGreaterThan(30);
    expect(loaded).toBeGreaterThan(baseline * 0.6);
  } else {
    // In software WebGL (SwiftShader) every translucent pixel is drawn on the CPU, which sets the
    // rate; this guards against a regression such as ground-primitive cells (1.4 of 12.3 fps).
    expect(loaded).toBeGreaterThan(baseline * 0.4);
  }
  expect(problems).toEqual([]);
});
