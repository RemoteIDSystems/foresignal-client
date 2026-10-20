import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

/** The live earthquake style's icon color (usgs-earthquakes, `#D9480F`). */
export const EARTHQUAKE_RGB: [number, number, number] = [0xd9, 0x48, 0x0f];

/** Records the map reports drawn for the enabled layers. */
export async function drawn(page: Page): Promise<number> {
  return Number(await page.getByTestId('map-viewer').getAttribute('data-record-features'));
}

/** Waits until the map has drawn records (`some`) or none. */
export async function waitForRecords(page: Page, some: boolean) {
  const count = expect.poll(() => drawn(page), { timeout: 60_000 });
  if (some) await count.toBeGreaterThan(0);
  else await count.toBe(0);
  // Let the frame with the change reach the screen.
  await page.waitForTimeout(1_500);
}

/**
 * Pixels on the map close to a color, counted in a real screenshot of the page: what a person
 * sees, not what the code says it drew. The screenshot is decoded in the page's own 2D canvas.
 */
export async function pixelsNear(page: Page, [r, g, b]: [number, number, number]): Promise<number> {
  const box = await page.getByTestId('map-viewer').boundingBox();
  const png = (await page.screenshot({ clip: box ?? undefined })).toString('base64');
  return page.evaluate(
    async ({ png, r, g, b }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const near =
          Math.abs(data[i]! - r) <= 24 &&
          Math.abs(data[i + 1]! - g) <= 24 &&
          Math.abs(data[i + 2]! - b) <= 24;
        if (near) count++;
      }
      return count;
    },
    { png, r, g, b },
  );
}

/**
 * Console errors and uncaught exceptions on a page, collected from now; a check fails on any. The
 * browser's own line for a rate-limited response (429) is not one: the backend limits anonymous
 * clients, the app's client waits and asks again, and a suite of checks that each load the whole
 * map meets the limit between them.
 */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/^Failed to load resource: the server responded with a status of 429\b/.test(text)) return;
    problems.push(text);
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

/** Opens a category of the rail, if it is not open, so its kinds' rows show. */
export async function openCategory(page: Page, label: string) {
  const toggle = page.getByRole('button', {
    name: new RegExp(`^(Show|Hide) the kinds in ${label.replace(/[()]/g, '\\$&')}$`),
  });
  // Waits for the rail to list the category; then opens it unless it is open.
  if ((await toggle.getAttribute('aria-label'))?.startsWith('Show')) await toggle.click();
}

/** A kind's checkbox in the rail, its category opened first. */
export async function kindToggle(page: Page, category: string, kind: string) {
  await openCategory(page, category);
  return page.locator(`li[data-layer="${kind}"] input[type="checkbox"]`);
}

/**
 * A backend read made by a check itself (not the page), waiting out the backend's rate limit for
 * anonymous clients (429 with Retry-After) as the app's own client does. A suite of checks that
 * each load the whole map can meet the limit between them.
 */
export async function getBackend(request: APIRequestContext, path: string): Promise<APIResponse> {
  for (let attempt = 0; ; attempt++) {
    const response = await request.get(path);
    if (response.status() !== 429 || attempt >= 10) return response;
    const wait = Number(response.headers()['retry-after'] ?? '1');
    await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(wait) ? wait : 1) * 1000));
  }
}

/** Checks the backend is up and its live earthquake layer has records, which these checks read. */
export async function expectLiveEarthquakes(request: APIRequestContext) {
  const kinds = await getBackend(request, '/v1/kinds');
  expect(kinds.ok(), 'the backend must be running on http://localhost:8080').toBe(true);
  const live = (await kinds.json()) as { kind: string; currentCount: number }[];
  expect(
    live.find((kind) => kind.kind === 'earthquake')?.currentCount ?? 0,
    'these checks read the live earthquake layer, which must have records',
  ).toBeGreaterThan(0);
}

/** Opens the Global dashboard and waits for the map. */
export async function openGlobal(page: Page) {
  await page.goto('/global');
  await page.locator('.cesium-widget canvas').waitFor();
}

/**
 * Stand-in data for layers that aggregate. Live aircraft (`aggBelowZoom` 7) has no records, and
 * only kinds with records are drawn, so `listKinds` is given one record of each kind here, each
 * kind's TileJSON says it aggregates below zoom 7 (aircraft's already does), and its `agg=hex`
 * tiles are answered with the live earthquake `agg=hex` tiles of the same address: real backend
 * cells, standing in. Record tiles (`agg=none`) still come from the backend.
 */
export async function standInDense(page: Page, kinds: readonly string[] = ['aircraft']) {
  const dense = kinds.join('|');
  await page.route('**/v1/kinds', async (route) => {
    const response = await route.fetch();
    const live = (await response.json()) as { kind: string }[];
    await route.fulfill({
      response,
      json: [
        ...live.filter((kind) => !kinds.includes(kind.kind)),
        ...kinds.map((kind) => ({ kind, currentCount: 1, sources: [`${kind}-stand-in`] })),
      ],
    });
  });
  await page.route(new RegExp(`/v1/tiles/(${dense})\\.json$`), async (route) => {
    const response = await route.fetch();
    const tileJson = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...tileJson, 'foresignal:aggBelowZoom': 7 } });
  });
  await page.route(
    new RegExp(`/v1/tiles/(${dense})/\\d+/\\d+/\\d+\\.mvt\\?.*agg=hex`),
    async (route) => {
      const url = route
        .request()
        .url()
        .replace(/\/tiles\/[^/]+\//, '/tiles/earthquake/');
      await route.fulfill({ response: await route.fetch({ url }) });
    },
  );
}

/** Hexagon cells the map reports drawn for the enabled layers. */
export async function drawnCells(page: Page): Promise<number> {
  return Number(await page.getByTestId('map-viewer').getAttribute('data-record-cells'));
}
