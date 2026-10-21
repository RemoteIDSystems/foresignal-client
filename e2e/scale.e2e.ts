import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Request } from '@playwright/test';
import type { ScaleReport } from '../src/map/stress/scaleScenario';
import { DENSE_KINDS, standInCatalog } from './dense-support';

/**
 * Scale and performance (035): the whole catalog on at once (every kind layer the live index lists,
 * given stand-in records as the 010 stress check gives them), then the harness's scale scenario at
 * world, region and city zoom. The report is written to `test-results/035-scale-<webgl>.json` for
 * the completion report's numbers.
 *
 * The change-stream connections are also counted from outside the page: every request to
 * `/v1/events/stream` the browser makes is open until it finishes or fails, so the most open at
 * once must be one, whatever the harness's own tally says.
 */
test('the full catalog at three zooms: one change stream, aggregated and in-view data, in budget', async ({
  page,
  request,
}) => {
  test.setTimeout(900_000);
  const open = new Set<Request>();
  let mostOpen = 0;
  const isChangeStream = (entry: Request) => new URL(entry.url()).pathname === '/v1/events/stream';
  page.on('request', (entry) => {
    if (!isChangeStream(entry)) return;
    open.add(entry);
    mostOpen = Math.max(mostOpen, open.size);
  });
  page.on('requestfinished', (entry) => open.delete(entry));
  page.on('requestfailed', (entry) => open.delete(entry));

  const kinds = await standInCatalog(page, request);
  await page.goto('/global?stress');
  await page.locator('.cesium-widget canvas').waitFor();
  const harness = page.getByTestId('stress-harness');
  await expect(harness).toBeVisible();
  await harness.getByRole('button', { name: `Turn on all ${kinds.length} kinds` }).click();
  await harness.getByRole('button', { name: /^Scale scenario/ }).click();
  const reportElement = page.getByTestId('scale-report');
  await expect(reportElement).toBeAttached({ timeout: 840_000 });
  const report = JSON.parse((await reportElement.textContent())!) as ScaleReport;

  const gpu = process.env.E2E_GPU === '1';
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    `test-results/035-scale-${gpu ? 'gpu' : 'software'}.json`,
    JSON.stringify({ gpu, kinds: kinds.length, mostOpenChangeStreams: mostOpen, report }, null, 2),
  );
  console.log(JSON.stringify({ gpu, kinds: kinds.length, mostOpen, problems: report.problems }));

  // One change stream, counted by the browser and by the client.
  expect(mostOpen).toBe(1);
  expect(report.maxChangeStreams).toBe(1);
  expect(report.layers).toBe(kinds.length);
  const [world, region, city] = report.steps;
  for (const step of report.steps) expect(step.settled).toBe(true);
  // Dense kinds draw as cells at world zoom (below their aggBelowZoom of 7).
  expect(DENSE_KINDS.length).toBeGreaterThan(0);
  expect(world!.totals.cells).toBeGreaterThan(0);
  // Raw records load only in view: the city holds fewer than the world, and fewer tiles are read.
  expect(city!.totals.features).toBeLessThan(world!.totals.features);
  expect(region).toBeDefined();
  // Software WebGL does not time frames as a GPU does, so the frame budget is held with E2E_GPU=1.
  if (gpu) expect(report.problems).toEqual([]);
  else expect(report.problems.filter((problem) => !problem.includes('frame'))).toEqual([]);
});
