import { expect, test, type Page, type Response } from '@playwright/test';
import { collectProblems } from './support';

/**
 * Basemap styles (038). The map opens on the NASA Marble overview; zoomed in past the overview
 * zoom it hands off to the picked basemap's detailed tiles: Esri Dark Gray for Map (no key in this
 * build, so CARTO is never asked), Esri World Imagery for Satellite. The credit on the map follows
 * the source drawn, switching source keeps a basemap layer on the globe at every frame, and the
 * pick is remembered across a reload. These checks fetch real tiles from both providers.
 */

/** San Francisco from 40 km: well past the hand-off zoom on the 2D map. */
const CITY = { longitude: -122.42, latitude: 37.77, height: 40_000 };
/** The whole world: the overview. */
const WORLD = { longitude: -95, latitude: 38, height: 20_000_000 };

const DARK_GRAY =
  /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/Canvas\/World_Dark_Gray_Base\//;
const ESRI = /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\//;
const CARTO = /basemaps\.cartocdn\.com/;

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(({ page }) => {
  problems = collectProblems(page);
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

/** Moves the camera over a place at once. */
async function moveTo(page: Page, at: typeof CITY) {
  await page.evaluate((at) => {
    const { camera, scene } = window.__foresignalEngine!.viewer;
    const here = camera.positionCartographic.clone();
    here.longitude = (at.longitude * Math.PI) / 180;
    here.latitude = (at.latitude * Math.PI) / 180;
    here.height = at.height;
    camera.setView({ destination: scene.globe.ellipsoid.cartographicToCartesian(here) });
  }, at);
}

/** Opens the global map with nothing remembered, and waits for its engine. */
async function openMap(page: Page) {
  await page.goto('/global');
  await page.evaluate(() => localStorage.removeItem('foresignal.basemapStyle'));
  await page.reload();
  await page.getByTestId('map-viewer').locator('.cesium-widget canvas').waitFor();
  await expect.poll(() => page.evaluate(() => Boolean(window.__foresignalEngine))).toBe(true);
}

/** Every tile response from the external basemap hosts, recorded from outside the page. */
function recordTiles(page: Page): Response[] {
  const responses: Response[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (DARK_GRAY.test(url) || ESRI.test(url) || CARTO.test(url)) responses.push(response);
  });
  return responses;
}

/** The image tiles answered by hosts matching `host`. */
function imagesFrom(responses: Response[], host: RegExp): Response[] {
  return responses.filter(
    (response) =>
      host.test(response.url()) &&
      response.status() === 200 &&
      /^image\//.test(response.headers()['content-type'] ?? ''),
  );
}

test('the map hands off from the NASA overview to Esri Dark Gray, with no key', async ({
  page,
}) => {
  const tiles = recordTiles(page);
  await openMap(page);
  const map = page.getByTestId('map-viewer');
  await moveTo(page, WORLD);
  await expect(map).toHaveAttribute('data-basemap', 'map');
  await expect(map).toHaveAttribute('data-basemap-detail', 'overview');
  await expect(page.getByTestId('map-attribution')).toContainText('NASA Blue Marble');
  expect(tiles).toEqual([]);

  await moveTo(page, CITY);
  await expect(map).toHaveAttribute('data-basemap-detail', 'esri-dark');
  await expect(page.getByTestId('map-attribution')).toContainText('Esri, HERE, Garmin');
  await expect
    .poll(() => imagesFrom(tiles, DARK_GRAY).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  // Without a key CARTO is never asked: its unkeyed tiles are an "API KEY REQUIRED" placeholder.
  expect(tiles.filter((response) => CARTO.test(response.url()))).toEqual([]);

  await moveTo(page, WORLD);
  await expect(map).toHaveAttribute('data-basemap-detail', 'overview');
});

test('Satellite draws Esri World Imagery, without a blink, and is remembered', async ({ page }) => {
  const tiles = recordTiles(page);
  await openMap(page);
  const map = page.getByTestId('map-viewer');
  await moveTo(page, CITY);
  await expect(map).toHaveAttribute('data-basemap-detail', 'esri-dark');
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const { globe } = window.__foresignalEngine!.viewer.scene;
        const check = () => (globe.tilesLoaded ? done() : requestAnimationFrame(check));
        check();
      }),
  );

  // Every frame of the swap has a detailed layer (street map or imagery) shown.
  await page.evaluate(() => {
    const at = window as unknown as { shownLayers: number[]; layerFrame: number };
    at.shownLayers = [];
    const { imageryLayers } = window.__foresignalEngine!.viewer;
    const tick = () => {
      let shown = 0;
      for (let i = 0; i < imageryLayers.length; i++) {
        const layer = imageryLayers.get(i);
        const url = (layer.imageryProvider as { url?: string } | undefined)?.url ?? '';
        if (layer.show && /arcgisonline/.test(url)) shown++;
      }
      at.shownLayers.push(shown);
      at.layerFrame = requestAnimationFrame(tick);
    };
    at.layerFrame = requestAnimationFrame(tick);
  });
  const basemap = page.getByRole('tablist', { name: 'Basemap' });
  await basemap.getByRole('tab', { name: 'Satellite', exact: true }).click();
  await expect(map).toHaveAttribute('data-basemap', 'satellite');
  await expect(map).toHaveAttribute('data-basemap-detail', 'esri');
  // The service's own credit (its `copyrightText`), read from it live.
  await expect(page.getByTestId('map-attribution')).toContainText(
    'Esri, Vantor, Earthstar Geographics, and the GIS User Community',
  );
  await expect.poll(() => imagesFrom(tiles, ESRI).length, { timeout: 30_000 }).toBeGreaterThan(0);
  // The old street map goes once the imagery is in.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const { imageryLayers } = window.__foresignalEngine!.viewer;
          let streets = 0;
          for (let i = 0; i < imageryLayers.length; i++) {
            const url =
              (imageryLayers.get(i).imageryProvider as { url?: string } | undefined)?.url ?? '';
            if (url.includes('openstreetmap')) streets++;
          }
          return streets;
        }),
      { timeout: 30_000 },
    )
    .toBe(0);
  const shown = await page.evaluate(() => {
    const at = window as unknown as { shownLayers: number[]; layerFrame: number };
    cancelAnimationFrame(at.layerFrame);
    return at.shownLayers;
  });
  expect(shown.length).toBeGreaterThan(0);
  expect(Math.min(...shown)).toBeGreaterThanOrEqual(1);

  await page.reload();
  await expect(page.getByTestId('map-viewer')).toHaveAttribute('data-basemap', 'satellite');
  await expect(
    page.getByRole('tablist', { name: 'Basemap' }).getByRole('tab', { name: 'Satellite' }),
  ).toHaveAttribute('aria-selected', 'true');
});
