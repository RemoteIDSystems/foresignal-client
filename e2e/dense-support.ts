import type { APIRequestContext, Page } from '@playwright/test';
import { encodeTile, type TestFeature } from '../src/map/records/testing/encodeTile';
import { getBackend } from './support';

/** The tile extent the stand-in tiles are encoded at. */
const EXTENT = 4096;

/** A stand-in record: where it is and what it carries. */
export interface StandInRecord {
  longitude: number;
  latitude: number;
  properties: Record<string, string | number | boolean>;
}

/** The kinds the stress stand-in aggregates below zoom 7, as the busiest kinds would. */
export const DENSE_KINDS = [
  'aircraft',
  'vessel',
  'satellite',
  'fire-detection',
  'news-article',
  'social-post',
];

/** Point records each other kind is given across the world by the stress stand-in. */
export const POINTS_PER_KIND = 200;

/** A tile of records, encoded as the backend would serve it: points in the tile, in tile units. */
export function recordTile(
  layer: string,
  records: readonly StandInRecord[],
  z: number,
  x: number,
  y: number,
): Uint8Array {
  const n = 2 ** z;
  const features: TestFeature[] = [];
  for (const record of records) {
    const tx = ((record.longitude + 180) / 360) * n - x;
    const rad = (record.latitude * Math.PI) / 180;
    const ty = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n - y;
    if (tx < 0 || tx >= 1 || ty < 0 || ty >= 1) continue;
    features.push({
      type: 'point',
      geometry: [[[Math.floor(tx * EXTENT), Math.floor(ty * EXTENT)]]],
      properties: record.properties,
    });
  }
  return features.length
    ? encodeTile([{ name: layer, extent: EXTENT, features }])
    : new Uint8Array();
}

/** A tile request's layer, zoom, column, row and aggregation, from its URL. */
function parseTileUrl(url: string) {
  const match = /\/v1\/tiles\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.mvt/.exec(url);
  if (!match) return undefined;
  const [, layer, z, x, y] = match;
  return {
    layer: decodeURIComponent(layer!),
    z: Number(z),
    x: Number(x),
    y: Number(y),
    agg: new URL(url).searchParams.get('agg'),
  };
}

/**
 * Stand-in earthquakes: the live earthquake layer's record tiles are answered with these records
 * (from `usgs-earthquakes`, so they take its live style), so a check knows where each one is.
 */
export async function standInQuakes(page: Page, records: readonly StandInRecord[]) {
  await page.route(/\/v1\/tiles\/earthquake\/\d+\/\d+\/\d+\.mvt/, async (route) => {
    const tile = parseTileUrl(route.request().url())!;
    if (tile.agg === 'hex') return route.fallback();
    await route.fulfill({
      body: Buffer.from(recordTile('earthquake', records, tile.z, tile.x, tile.y)),
      headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile' },
    });
  });
}

/** Numbers in [0, 1) from a seed, the same every run. */
function seeded(seed: number) {
  let state = seed % 2147483647 || 1;
  return () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
}

/** A small hash of a string, for a per-kind seed. */
function hash(text: string): number {
  let h = 7;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) % 2147483647;
  return h;
}

/** A kind's stand-in records: {@link POINTS_PER_KIND} points scattered over the world. */
function kindRecords(kind: string): StandInRecord[] {
  const random = seeded(hash(kind));
  return Array.from({ length: POINTS_PER_KIND }, (_, i) => ({
    longitude: -180 + random() * 360,
    latitude: -60 + random() * 130,
    properties: {
      kind,
      source: `${kind}-stand-in`,
      externalId: `${kind}-${i}`,
      title: `${kind} ${i}`,
      observedAt: 1_792_500_000,
    },
  }));
}

/**
 * Stand-in data for the whole catalog, as the stress harness draws it: every kind layer the live
 * index lists gets records. {@link DENSE_KINDS} aggregate below zoom 7, their `agg=hex` tiles
 * answered with the live earthquake cells of the same address (real backend cells, standing in);
 * every other kind but earthquake (which keeps its live records) is given
 * {@link POINTS_PER_KIND} points over the world, encoded per tile. Returns the kind ids.
 */
export async function standInCatalog(page: Page, request: APIRequestContext): Promise<string[]> {
  const index = (await (await getBackend(request, '/v1/tiles.json')).json()) as {
    layers: { id: string; type: string }[];
  };
  const kinds = index.layers.filter((layer) => layer.type === 'kind').map((layer) => layer.id);
  const records = new Map<string, StandInRecord[]>();
  await page.route('**/v1/kinds', async (route) => {
    // Read here, not through the page's request: the browser's may be a revalidation (304).
    const live = (await (await getBackend(request, '/v1/kinds')).json()) as {
      kind: string;
      currentCount: number;
    }[];
    const counted = new Map(live.map((kind) => [kind.kind, kind]));
    await route.fulfill({
      json: kinds.map(
        (kind) =>
          counted.get(kind) ?? {
            kind,
            currentCount: POINTS_PER_KIND,
            sources: [`${kind}-stand-in`],
          },
      ),
    });
  });
  const dense = DENSE_KINDS.join('|');
  await page.route(new RegExp(`/v1/tiles/(${dense})\\.json$`), async (route) => {
    const response = await route.fetch();
    const tileJson = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...tileJson, 'foresignal:aggBelowZoom': 7 } });
  });
  await page.route(/\/v1\/tiles\/[^/]+\/\d+\/\d+\/\d+\.mvt/, async (route) => {
    const tile = parseTileUrl(route.request().url())!;
    if (tile.layer === 'earthquake') return route.fallback();
    if (DENSE_KINDS.includes(tile.layer)) {
      if (tile.agg === 'hex') {
        const url = route
          .request()
          .url()
          .replace(/\/tiles\/[^/]+\//, '/tiles/earthquake/');
        return route.fulfill({ response: await route.fetch({ url }) });
      }
      return route.fulfill({
        body: '',
        headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile' },
      });
    }
    let kindPoints = records.get(tile.layer);
    if (!kindPoints) {
      kindPoints = kindRecords(tile.layer);
      records.set(tile.layer, kindPoints);
    }
    await route.fulfill({
      body: Buffer.from(recordTile(tile.layer, kindPoints, tile.z, tile.x, tile.y)),
      headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile' },
    });
  });
  return kinds;
}
