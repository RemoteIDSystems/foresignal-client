import { expect, test, type Request, type Route } from '@playwright/test';
import { standInQuakes, type StandInRecord } from './dense-support';
import {
  collectProblems,
  drawn,
  expectLiveEarthquakes,
  kindToggle,
  openGlobal,
  STREAM_LIVE_MS,
  waitForRecords,
} from './support';

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  await expectLiveEarthquakes(request);
});

/** The page's live stream connections, as the browser made them. */
const isStream = (request: Request) => /\/v1\/events\/stream\?/.test(request.url());
const isFilterPatch = (request: Request) =>
  request.method() === 'PATCH' && /\/v1\/events\/stream\/[^/]+\/filter$/.test(request.url());

test('one live stream stays connected, re-filters in place, and resumes after a forced reconnect', async ({
  page,
}) => {
  const streams: Request[] = [];
  const patches: Request[] = [];
  page.on('request', (request) => {
    if (isStream(request)) streams.push(request);
    if (isFilterPatch(request)) patches.push(request);
  });
  await openGlobal(page);
  const badge = page.getByTestId('live-state');
  // The real backend's stream: hello arrives and the badge reads as the mock's.
  await expect(badge).toHaveAttribute('data-state', 'live', { timeout: STREAM_LIVE_MS });
  await expect(badge).toHaveText('◆ LIVE');
  await expect(badge).not.toHaveAttribute('data-filter-pending');
  const version = Number(await badge.getAttribute('data-filter-version'));
  // The backend counts open streams per address, and holds a dropped one's place until it notices
  // (STREAM_LIMIT, 429 with Retry-After): the first connection may have taken a retry or two.
  const opened = streams.length;

  // A layer turned on or off re-filters the open stream: a PATCH, confirmed by filter-applied.
  const toggle = await kindToggle(page, 'Disasters / Hazards', 'earthquake');
  const wasOn = await toggle.isChecked();
  await toggle.setChecked(!wasOn);
  await expect(badge).toHaveAttribute('data-filter-version', String(version + 1), {
    timeout: 15_000,
  });
  await expect(badge).not.toHaveAttribute('data-filter-pending');
  const body = patches.at(-1)!.postDataJSON() as { changes: { kind: string[] } };
  expect(body.changes.kind.includes('earthquake')).toBe(!wasOn);
  expect(await patches.at(-1)!.headerValue('foresignal-stream-key')).toBeTruthy();
  expect(streams).toHaveLength(opened);
  if (wasOn) await toggle.setChecked(true);

  // A dropped connection reconnects with the last change's cursor, and is live again.
  const lastSeq = await badge.getAttribute('data-last-seq');
  const connections = Number(await badge.getAttribute('data-connections'));
  const before = streams.length;
  await page.evaluate(() => window.__foresignalEngine!.stream!.reconnectNow());
  await expect(badge).toHaveAttribute('data-connections', String(connections + 1));
  // The dropped stream's place is held a while, so the reconnect may wait out the limit.
  await expect(badge).toHaveAttribute('data-state', 'live', { timeout: STREAM_LIVE_MS });
  expect(streams.length).toBeGreaterThan(before);
  for (const stream of streams.slice(before)) {
    expect(await stream.headerValue('last-event-id')).toBe(`c=${lastSeq}`);
  }
  // Still one stream: once live, nothing opens beside it.
  const live = streams.length;
  await page.waitForTimeout(2_000);
  expect(streams).toHaveLength(live);
  expect(problems).toEqual([]);
});

/** Stand-in quakes in the default view of the Americas. */
const quake = (i: number, longitude: number, latitude: number, title: string): StandInRecord => ({
  longitude,
  latitude,
  properties: {
    kind: 'earthquake',
    source: 'usgs-earthquakes',
    externalId: `live${i}`,
    title,
    mag: 5,
    observedAt: 1_792_500_000 + i,
  },
});

/** The change event or `listChanges` item for a stand-in quake that just arrived. */
function changeOf(seq: number, record: StandInRecord) {
  const { longitude, latitude } = record;
  return {
    seq,
    source: 'usgs-earthquakes',
    externalId: String(record.properties.externalId),
    kind: 'earthquake',
    version: 1,
    observedAt: '2026-10-20T12:00:00Z',
    tombstone: false,
    leftFilter: false,
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    bbox: [longitude, latitude, longitude, latitude],
    prevSeq: null,
    persistReason: 'FIRST',
  };
}

/** A stream response body: SSE events as the backend writes them. */
function events(...items: { event: string; data: unknown; id?: string }[]): string {
  return items
    .map(
      ({ event, data, id }) =>
        `${id ? `id:${id}\n` : ''}event:${event}\ndata:${JSON.stringify(data)}\n\n`,
    )
    .join('');
}

const hello = (watermarkSeq: number) => ({
  event: 'hello',
  data: { streamId: 'E2eStreamE2eStreamE2e0', topics: ['changes'], watermarkSeq, filterVersion: 1 },
});

test('a change on the stream shows on the map; a dropped stream catches up and resumes, losing nothing', async ({
  page,
}) => {
  const quakes = [quake(0, -76.5, 28.4, 'M 5.0 - Stand-in A'), quake(1, -90, 24, 'M 5.0 - B')];
  await standInQuakes(page, quakes);
  const arriving = {
    stream: quake(10, -66, 17, 'M 5.0 - New on the stream'),
    catchUp: quake(11, -80, 20, 'M 5.0 - Missed while away'),
    resumed: quake(12, -70, 30, 'M 5.0 - Replayed on resume'),
  };

  // The stream as the test scripts it: the first connection waits to be released; each scripted
  // connection then ends, as a dropped connection does; the third goes to the real backend.
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const cursors: (string | null)[] = [];
  await page.route(/\/v1\/events\/stream\?/, async (route: Route) => {
    const request = route.request();
    cursors.push(await request.headerValue('last-event-id'));
    const connection = cursors.length;
    if (connection === 1) {
      await released;
      quakes.push(arriving.stream);
      return route.fulfill({
        headers: { 'Content-Type': 'text/event-stream' },
        body: events(hello(5000), {
          event: 'change',
          data: changeOf(5001, arriving.stream),
          id: 'c=5001',
        }),
      });
    }
    if (connection === 2) {
      quakes.push(arriving.resumed);
      return route.fulfill({
        headers: { 'Content-Type': 'text/event-stream' },
        body: events(
          hello(5003),
          // Replayed from the cursor: already caught up, so not handed on twice.
          { event: 'change', data: changeOf(5002, arriving.catchUp), id: 'c=5002' },
          { event: 'change', data: changeOf(5003, arriving.resumed), id: 'c=5003' },
        ),
      });
    }
    const headers = { ...request.headers() };
    delete headers['last-event-id'];
    return route.continue({ headers });
  });
  // The scripted stream id is not the backend's: its filter swaps are accepted here.
  await page.route(/\/v1\/events\/stream\/E2eStream[^/]*\/filter$/, (route) =>
    route.fulfill({ json: {} }),
  );
  // Catch-up after the first drop finds the quake missed while the stream was down.
  const catchUps: URL[] = [];
  await page.route(/\/v1\/changes\?/, async (route) => {
    const url = new URL(route.request().url());
    catchUps.push(url);
    const after = Number(url.searchParams.get('after'));
    if (after === 5001) {
      quakes.push(arriving.catchUp);
      return route.fulfill({
        json: { items: [changeOf(5002, arriving.catchUp)], lastSeq: 5002, hasMore: false },
      });
    }
    return route.fulfill({ json: { items: [], lastSeq: after, hasMore: false } });
  });

  await openGlobal(page);
  const toggle = await kindToggle(page, 'Disasters / Hazards', 'earthquake');
  await toggle.check();
  await waitForRecords(page, true);
  await expect.poll(() => drawn(page)).toBe(2);
  const badge = page.getByTestId('live-state');
  await expect(badge).toHaveAttribute('data-state', 'connecting');
  // Every change the page is handed, in order, from the stream and from catch-up.
  await page.evaluate(() => {
    const seen: number[] = [];
    (window as unknown as { __seqs: number[] }).__seqs = seen;
    window.__foresignalEngine!.stream!.listen({
      changes: (changes) => seen.push(...changes.map((change) => change.seq)),
    });
  });

  release();
  // The new quake is drawn without the view moving: its tile is fetched again and redrawn.
  await expect.poll(() => drawn(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  // The stream drops; the reconnect catches up first, then resumes from the caught-up cursor.
  await expect.poll(() => drawn(page), { timeout: 30_000 }).toBe(5);
  await expect(badge).toHaveAttribute('data-state', 'live', { timeout: STREAM_LIVE_MS });
  expect(cursors.slice(0, 3)).toEqual([null, 'c=5002', 'c=5003']);
  expect(catchUps[0]!.searchParams.get('after')).toBe('5001');
  expect(catchUps[0]!.searchParams.getAll('kind')).toContain('earthquake');
  const seqs = await page.evaluate(() => (window as unknown as { __seqs: number[] }).__seqs);
  expect(seqs).toEqual([5001, 5002, 5003]);
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: 'review/011-live-stream.png' });
  expect(problems).toEqual([]);
});
