import { crc32, deflateSync } from 'node:zlib';
import type { APIRequestContext, Page, Route } from '@playwright/test';
import { encodeTile } from '../src/map/records/testing/encodeTile';
import { getBackend } from './support';

/**
 * Stand-in data for the raster products and wind (009). Every product on the backend these checks
 * run against is disabled ("source disabled"), with no frame to draw, so the products named here
 * are reported healthy and their frames, tiles, loops and wind fields are made up: a tropical
 * storm off the Carolinas (where the Tropical-Storm mock puts Florence), its cloud shield, its
 * radar bands and its vortex of winds. The colors are the backend's own: the legends come live
 * (`getProductLegend`), and the stand-in tiles are painted with their stops. Only the catalog's
 * health and these products' frame endpoints are intercepted; everything else is the backend's.
 */

/** Where the stand-in storm is centered: the Tropical-Storm mock's 28.4° N, 76.5° W. */
export const STORM = { lon: -76.5, lat: 28.4 } as const;

/** The products made healthy, and drawn from stand-in frames. */
export const STAND_IN_PRODUCTS = ['goes-east-ir', 'mrms-reflectivity', 'gfs'] as const;

/** Frames in a stand-in loop; one more, already expired, is listed and must be dropped. */
export const LOOP_FRAMES = 10;

/** A legend's color stops, as `getProductLegend` gives them. */
interface Stops {
  stops: { value: number; color: string }[];
}

/** The stand-in frame time: on the hour, so frame keys are stable within a run. */
function frameTime(stepsBack = 0): Date {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  return new Date(now.getTime() - stepsBack * 10 * 60_000);
}

/** The backend's path form of a time, `20261020T140000Z`. */
function timeKey(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
}

/** Encodes RGBA pixels as a PNG (8-bit RGBA, no filtering). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      rows,
      y * (width * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distance (km) and bearing (radians, counterclockwise from east) of a point from the storm. */
function polar(lon: number, lat: number): { r: number; theta: number } {
  const x = (lon - STORM.lon) * 111 * Math.cos((STORM.lat * Math.PI) / 180);
  const y = (lat - STORM.lat) * 111;
  return { r: Math.hypot(x, y), theta: Math.atan2(y, x) };
}

/** Stand-in radar reflectivity (dBZ): spiral rain bands round an eye, turning with `t`. */
function reflectivity(lon: number, lat: number, t: number): number {
  const { r, theta } = polar(lon, lat);
  if (r < 25 || r > 700) return 0;
  const spiral = Math.cos(2 * (theta + Math.log(r / 25) * 1.6 - t * 0.25));
  const wall = 62 * Math.exp(-((r - 60) ** 2) / 900);
  const bands = (52 * Math.exp(-r / 320) + 4) * (0.55 + 0.45 * spiral);
  return Math.max(wall, bands);
}

/** Stand-in cloud cover (0..1): the storm's shield and a few broad bands elsewhere. */
function cloud(lon: number, lat: number): number {
  const { r, theta } = polar(lon, lat);
  const shield = Math.exp(-r / 650) * (0.75 + 0.25 * Math.cos(2 * (theta + Math.log(1 + r / 40))));
  const bands =
    0.5 +
    0.25 * Math.sin((lon + 2 * lat) / 9) +
    0.25 * Math.sin((lat - lon / 3) / 5) * Math.cos(lon / 13);
  return Math.max(r < 20 ? 0 : shield * 1.2, (bands - 0.55) * 1.6);
}

/** Stand-in 10 m wind (m/s): a counterclockwise vortex on easterly trades and westerlies. */
export function wind(lon: number, lat: number): [number, number] {
  const { r, theta } = polar(lon, lat);
  const radius = 70;
  const speed = r < radius ? 36 * (r / radius) : 36 * (radius / r) ** 0.6;
  const fade = Math.exp(-r / 1200);
  const band = Math.min(1, Math.max(0, (Math.abs(lat) - 20) / 20));
  const u = -6 + 16 * band + 3 * Math.sin((lon * Math.PI) / 45);
  const v = 3 * Math.sin((lon * Math.PI) / 30) * Math.cos((lat * Math.PI) / 90);
  return [u - speed * Math.sin(theta) * fade, v + speed * Math.cos(theta) * fade];
}

/** A hex color to RGB. */
function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The color of the band a value falls in (discrete legends). */
function bandColor(stops: Stops['stops'], value: number): [number, number, number] | undefined {
  let color: string | undefined;
  for (const stop of stops) if (stop.value <= value) color = stop.color;
  return color ? rgb(color) : undefined;
}

/** A color interpolated between stops (continuous legends). */
function rampColor(stops: Stops['stops'], value: number): [number, number, number] {
  if (value <= stops[0]!.value) return rgb(stops[0]!.color);
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (value <= b.value) {
      const f = (value - a.value) / (b.value - a.value);
      const [ra, ga, ba] = rgb(a.color);
      const [rb, gb, bb] = rgb(b.color);
      return [ra + (rb - ra) * f, ga + (gb - ga) * f, ba + (bb - ba) * f];
    }
  }
  return rgb(stops[stops.length - 1]!.color);
}

/** A pixel's longitude and latitude in a Web Mercator tile. */
function tilePoint(z: number, x: number, y: number, px: number, py: number): [number, number] {
  const n = 2 ** z;
  const lon = ((x + px) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py)) / n))) * 180) / Math.PI;
  return [lon, lat];
}

/** Paints a product's stand-in pixel at a point and time; transparent where it has nothing. */
type Painter = (lon: number, lat: number, t: number) => [number, number, number, number];

/** The painters, from the live legends. */
async function painters(request: APIRequestContext): Promise<Record<string, Painter>> {
  const legend = async (id: string) =>
    ((await (await getBackend(request, `/v1/products/${id}/legend`)).json()) as Stops).stops;
  const radar = await legend('mrms-reflectivity');
  const speed = await legend('gfs');
  return {
    'mrms-reflectivity': (lon, lat, t) => {
      const color = bandColor(radar, reflectivity(lon, lat, t));
      return color ? [...color, 255] : [0, 0, 0, 0];
    },
    'goes-east-ir': (lon, lat) => {
      const cover = Math.min(1, cloud(lon, lat));
      if (cover <= 0.05) return [0, 0, 0, 0];
      const shade = 170 + 85 * cover;
      return [shade, shade, shade, Math.round(255 * cover)];
    },
    gfs: (lon, lat) => {
      const [u, v] = wind(lon, lat);
      return [...rampColor(speed, Math.hypot(u, v)), 255];
    },
  };
}

/** A 256-pixel tile of a product, painted. */
function tilePng(paint: Painter, z: number, x: number, y: number, t = 0): Buffer {
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const [lon, lat] = tilePoint(z, x, y, (px + 0.5) / size, (py + 0.5) / size);
      pixels.set(paint(lon, lat, t), (py * size + px) * 4);
    }
  }
  return encodePng(size, size, pixels);
}

/** A Web Mercator image of a box, painted (a loop frame). */
function imagePng(paint: Painter, bbox: number[], width: number, height: number, t: number) {
  const [west, south, east, north] = bbox as [number, number, number, number];
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const top = mercator(north);
  const bottom = mercator(south);
  const pixels = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    const m = top - ((py + 0.5) / height) * (top - bottom);
    const lat = (Math.atan(Math.sinh(m)) * 180) / Math.PI;
    for (let px = 0; px < width; px++) {
      const lon = west + ((px + 0.5) / width) * (east - west);
      pixels.set(paint(lon, lat, t), (py * width + px) * 4);
    }
  }
  return encodePng(width, height, pixels);
}

/** The png-uv field: R = u and G = v over ±40 m/s, a 1° grid with longitudes 0..359. */
function fieldPng(): Buffer {
  const width = 360;
  const height = 181;
  const pixels = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const [u, v] = wind(column > 180 ? column - 360 : column, 90 - row);
      const scale = (value: number) =>
        Math.round(((Math.max(-40, Math.min(40, value)) + 40) / 80) * 255);
      pixels.set([scale(u), scale(v), 0, 255], (row * width + column) * 4);
    }
  }
  return encodePng(width, height, pixels);
}

/** A wind vector tile: 8 × 8 points at the centers of 32-pixel cells, as the backend samples. */
function windTile(z: number, x: number, y: number): Buffer {
  const features = [];
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      const [lon, lat] = tilePoint(z, x, y, (i * 32 + 16) / 256, (j * 32 + 16) / 256);
      const [u, v] = wind(lon, lat);
      const speed = Math.hypot(u, v);
      features.push({
        type: 'point' as const,
        geometry: [[[(i * 32 + 16) * 16, (j * 32 + 16) * 16]]] as [number, number][][],
        properties: {
          speedMs: Math.round(speed * 10) / 10,
          fromDeg: Math.round((((270 - (Math.atan2(v, u) * 180) / Math.PI) % 360) + 360) % 360),
          barbKt: Math.round((speed * 1.943844) / 5) * 5,
        },
      });
    }
  }
  return Buffer.from(encodeTile([{ name: 'wind', extent: 4096, features }]));
}

/** Routes the stand-in products on a page. */
export async function standInProducts(page: Page, request: APIRequestContext): Promise<void> {
  const paint = await painters(request);
  const ids = new Set<string>(STAND_IN_PRODUCTS);
  const time = frameTime();
  // `{timeKey}~{sha8}`, the sha8 made up per product.
  const frameKey = (id: string, step = 0) =>
    `${timeKey(frameTime(step))}~${(0xa5000000 + id.length * 4099).toString(16)}`;
  const run = time.toISOString().replace(/\.\d+Z$/, 'Z');
  const origin = new URL(page.url() === 'about:blank' ? 'http://localhost:5179' : page.url())
    .origin;

  await page.route(/\/v1\/products(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const page = (await response.json()) as { items: Record<string, unknown>[] };
    for (const item of page.items) {
      if (ids.has(item.id as string)) {
        item.status = {
          health: 'healthy',
          stale: false,
          lastFrameAt: time.toISOString(),
          reason: null,
        };
      }
    }
    await route.fulfill({ response, json: page });
  });

  const fulfill = (route: Route, body: Buffer, contentType: string) =>
    route.fulfill({ status: 200, body, contentType, headers: { 'Cache-Control': 'no-store' } });

  await page.route(
    /\/v1\/products\/[^/]+\/(frames\/latest|tiles|image|vectors|fields)/,
    async (route) => {
      const url = new URL(route.request().url());
      const [, , , id, what, ...rest] = url.pathname.split('/');
      if (!id || !ids.has(id)) return route.fallback();
      if (what === 'frames') {
        const style =
          id === 'gfs'
            ? 'wind-speed@1'
            : id === 'goes-east-ir'
              ? 'ir-gray@1'
              : 'nws-reflectivity@1';
        const key = frameKey(id);
        const runQuery = id === 'gfs' ? `&run=${encodeURIComponent(run)}` : '';
        return route.fulfill({
          json: {
            productId: id,
            time: time.toISOString(),
            timeKey: timeKey(time),
            frameKey: key,
            status: 'complete',
            expiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
            run: id === 'gfs' ? run : null,
            step: id === 'gfs' ? 0 : null,
            tiles: `${origin}/v1/products/${id}/tiles/${key}/{z}/{x}/{y}.png?style=${style}${runQuery}`,
            bounds: [-180, -90, 180, 90],
          },
        });
      }
      if (what === 'tiles') {
        const [, z, x, y] = rest;
        return fulfill(
          route,
          tilePng(paint[id]!, Number(z), Number(x), parseInt(y!, 10)),
          'image/png',
        );
      }
      if (what === 'image') {
        // The frame's step back from the newest, from its time key.
        const key = /^(\d{8}T\d{6}Z)/.exec(rest[0]!)?.[1] ?? timeKey(time);
        const when = Date.UTC(
          Number(key.slice(0, 4)),
          Number(key.slice(4, 6)) - 1,
          Number(key.slice(6, 8)),
          Number(key.slice(9, 11)),
          Number(key.slice(11, 13)),
        );
        const step = Math.round((time.getTime() - when) / 600_000);
        const bbox = url.searchParams.get('bbox')!.split(',').map(Number);
        const width = Number(url.searchParams.get('width'));
        const height = Number(url.searchParams.get('height'));
        return fulfill(
          route,
          imagePng(paint[id]!, bbox, width, height, LOOP_FRAMES - step),
          'image/png',
        );
      }
      if (what === 'vectors') {
        const [, z, x, y] = rest;
        return fulfill(
          route,
          windTile(Number(z), Number(x), parseInt(y!, 10)),
          'application/vnd.mapbox-vector-tile',
        );
      }
      if (what === 'fields' && url.pathname.endsWith('.png-uv')) {
        return fulfill(route, fieldPng(), 'image/png');
      }
      if (what === 'fields' && url.pathname.endsWith('.json')) {
        const key = frameKey(id);
        return route.fulfill({
          json: {
            schemaVersion: 1,
            model: id,
            cycle: {
              date: run.slice(0, 10).replace(/-/g, ''),
              hour: time.getUTCHours(),
              forecastHour: 0,
              runIso: run,
              validIso: run,
            },
            level: '10 m above ground',
            units: 'm/s',
            grid: { nx: 360, ny: 181, lo1: 0, la1: 90, dx: 1, dy: 1 },
            stale: false,
            unavailable: false,
            reason: null,
            components: [
              { name: 'u', offset: 0 },
              { name: 'v', offset: 260640 },
            ],
            byteLength: 521280,
            sha256: '0'.repeat(64),
            dataUrl: `${origin}/v1/products/${id}/fields/${key}.f32?run=${encodeURIComponent(run)}&res=1`,
            encodings: {
              pngUv: {
                url: `${origin}/v1/products/${id}/fields/${key}.png-uv?run=${encodeURIComponent(run)}&res=1`,
                uMin: -40,
                uMax: 40,
                vMin: -40,
                vMax: 40,
                width: 360,
                height: 181,
                bounds: [0, -90, 359, 90],
              },
            },
          },
        });
      }
      return route.fallback();
    },
  );

  await page.route(/\/v1\/products\/loop\?/, async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('products');
    if (!id || !ids.has(id)) return route.fallback();
    const [west, south, east, north] = url.searchParams.get('bbox')!.split(',').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const bounds = [west, Math.max(-85, south), east, Math.min(85, north)];
    const width = Number(url.searchParams.get('width') ?? 512);
    const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const height = Math.max(
      64,
      Math.round(
        (width * (mercator(bounds[3]!) - mercator(bounds[1]!))) /
          (((bounds[2]! - bounds[0]!) * Math.PI) / 180),
      ),
    );
    const bbox = bounds.join(',');
    // Newest last; the oldest has already expired, and the client must drop it.
    const frames = Array.from({ length: LOOP_FRAMES + 1 }, (_, i) => {
      const step = LOOP_FRAMES - i;
      const when = frameTime(step);
      const key = frameKey(id, step);
      return {
        productId: id,
        time: when.toISOString(),
        timeKey: timeKey(when),
        frameKey: key,
        kind: 'observed',
        url: `${origin}/v1/products/${id}/image/${key}.png?bbox=${bbox}&width=${width}&height=${height}&crs=EPSG:3857`,
        expiresAt: new Date(
          Date.now() + (step === LOOP_FRAMES ? -60_000 : 3_600_000),
        ).toISOString(),
      };
    });
    await route.fulfill({
      json: {
        crs: 'EPSG:3857',
        bounds,
        coordinates: [
          [bounds[0], bounds[3]],
          [bounds[2], bounds[3]],
          [bounds[2], bounds[1]],
          [bounds[0], bounds[1]],
        ],
        width,
        height,
        products: [id],
        frames,
        legendUrl: `${origin}/v1/products/${id}/legend`,
        attribution: [],
        serverTime: new Date().toISOString(),
      },
    });
  });
}
