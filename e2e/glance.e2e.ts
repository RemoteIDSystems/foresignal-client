import { expect, test } from '@playwright/test';
import { collectProblems, expectLiveEarthquakes, getBackend, openGlobal } from './support';

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page, request }) => {
  problems = collectProblems(page);
  await expectLiveEarthquakes(request);
});

test('the status strip and the inset heat show the backend’s live status and activity, and refresh', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const glanceReads: (string | null)[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/v1/glance') {
      glanceReads.push(request.headers()['if-none-match'] ?? null);
    }
  });
  const series = page.waitForResponse((response) =>
    response.url().includes('/v1/stats/timeseries'),
  );
  const top = page.waitForResponse((response) =>
    response.url().includes('/v1/stats/top?by=source'),
  );
  await openGlobal(page);
  // What the page was told: the live series and top source, as the backend answered them.
  const answered = (await (await series).json()) as {
    series: { points: { value: number }[] }[];
  };
  const points = answered.series[0]?.points ?? [];
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const leader = ((await (await top).json()) as { items: { sourceId: string; count: number }[] })
    .items[0]!;
  const glance = (await (await getBackend(page.request, '/v1/glance')).json()) as {
    status: string;
  };

  const strip = page.getByTestId('glance-strip');
  await expect(strip).toHaveAttribute('data-status', glance.status);
  await expect(page.getByTestId('glance-activity')).toHaveAttribute('data-total', String(total));
  expect(total).toBeGreaterThan(0);
  await expect(page.getByTestId('glance-activity')).toContainText(
    `${total.toLocaleString('en-US')} changes · 24 h`,
  );
  const sparkline = strip.getByRole('img', { name: /^Record changes per hour/ });
  await expect(sparkline).toHaveAttribute('data-points', String(points.length));
  expect(points.length).toBeGreaterThan(12);
  await expect(page.getByTestId('glance-top')).toContainText(
    `USGS Earthquakes ${leader.count.toLocaleString('en-US')}`,
  );
  expect(leader.sourceId).toBe('usgs-earthquakes');
  // The activity heat on the global-view inset: the live grid's cells.
  const heat = page.getByTestId('inset-heat');
  await expect(heat).toBeVisible();
  expect(Number(await heat.getAttribute('data-cells'))).toBeGreaterThan(0);
  await page.screenshot({ path: 'review/018-glance.png' });
  // The status is read again on its interval, revalidated by its ETag.
  await expect.poll(() => glanceReads.length, { timeout: 40_000 }).toBeGreaterThan(1);
  expect(glanceReads.at(-1)).toMatch(/^(W\/)?"/);
  expect(problems).toEqual([]);
});
