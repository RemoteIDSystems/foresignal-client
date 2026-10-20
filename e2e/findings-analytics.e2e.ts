import { expect, test, type Page } from '@playwright/test';
import {
  finding,
  findingEnvelope,
  FINDING_ID,
  impact,
  rate,
  regionSeries,
  seriesData,
} from '../src/intel/testing/analyticsFixtures';
import {
  changes,
  eventMember,
  member,
  situation,
  SITUATION_ID,
  timeline,
} from '../src/intel/testing/fixtures';
import { collectProblems } from './support';

/**
 * The Evidence tab (020). The local backend has no situations, findings, impacts or series, so the
 * situation and analytics reads are stand-ins (the 019 and 020 fixtures); the chart is drawn by
 * ECharts in the browser.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
});

/** Answers the situation and analytics reads, and records the finding changes. */
async function standIn(page: Page) {
  const changed: { method: string; body: unknown }[] = [];
  const base = `/v1/situations/${SITUATION_ID}`;
  const items = (list: unknown[]) => ({ json: { items: list, nextCursor: null } });
  await page.route(new RegExp(`${base}(\\?.*)?$`), (route) => route.fulfill({ json: situation }));
  await page.route(new RegExp(`${base}/members(\\?.*)?$`), (route) =>
    route.fulfill(items([member, eventMember])),
  );
  await page.route(new RegExp(`${base}/timeline(\\?.*)?$`), (route) =>
    route.fulfill(items(timeline)),
  );
  await page.route(new RegExp(`${base}/changes(\\?.*)?$`), (route) =>
    route.fulfill({ json: changes }),
  );
  await page.route(/\/v1\/objects\/situation%3A[^/]+\/related/, (route) =>
    route.fulfill({ json: { ref: `situation:${SITUATION_ID}`, items: [] } }),
  );
  await page.route(/\/v1\/analytics\/findings(\?.*)?$/, (route) => route.fulfill(items([finding])));
  await page.route(new RegExp(`/v1/analytics/findings/${FINDING_ID}$`), (route) => {
    changed.push({ method: route.request().method(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { ...finding, status: 'dismissed' } });
  });
  await page.route(new RegExp(`/v1/objects/finding%3A${FINDING_ID}$`), (route) =>
    route.fulfill({ json: findingEnvelope }),
  );
  await page.route(/\/v1\/analytics\/impacts(\?.*)?$/, (route) => route.fulfill(items([impact])));
  await page.route(/\/v1\/analytics\/impact-rates(\?.*)?$/, (route) =>
    route.fulfill(items([rate])),
  );
  await page.route(/\/v1\/analytics\/series(\?.*)?$/, (route) =>
    route.fulfill(items(regionSeries)),
  );
  await page.route(/\/v1\/analytics\/series\/data\?/, (route) => {
    const ref = new URL(route.request().url()).searchParams.get('ref')!;
    return route.fulfill({ json: seriesData(ref, 2, 1) });
  });
  return changed;
}

test('the Evidence tab charts the metrics, lists the evidence, and dismisses a finding', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const changed = await standIn(page);
  await page.goto(`/intelligence/situations/${SITUATION_ID}`);
  await page.getByRole('tab', { name: 'Evidence (2)' }).click();
  await expect(page).toHaveURL(/tab=evidence/);

  // The metrics: one ECharts canvas with a line per seismic series, and the 30-day tiles.
  const chart = page.getByTestId('metrics-chart');
  await expect(chart).toHaveAttribute('data-series', '2');
  await expect(chart.locator('canvas')).toBeVisible();
  const box = await chart.boundingBox();
  expect(box!.height).toBe(200);
  await expect(page.getByTestId('metric-tiles')).toContainText('+100% vs. prev. 30d');
  await page.getByTestId('metrics-panel').getByRole('tab', { name: 'Outage' }).click();
  await expect(chart).toHaveAttribute('data-series', '1');

  // The evidence, by type.
  const evidence = page.getByTestId('evidence-panel');
  await evidence.getByRole('tab', { name: 'Reports (1)' }).click();
  await expect(evidence.getByRole('list', { name: 'Evidence' }).getByRole('listitem')).toHaveCount(
    1,
  );

  // The impact and its historical rate.
  await expect(page.getByTestId('impacts-panel')).toContainText('Base rate: 50% (40%–60%), n = 42');

  // A finding in full, dismissed with a reason.
  const findings = page.getByTestId('findings-panel');
  await expect(findings.getByTestId('finding-base-rate')).toContainText('flagged once');
  await findings.getByRole('button', { name: finding.title }).click();
  const detail = page.getByTestId('finding-detail');
  await expect(detail).toContainText('Fewer than 30 events in the window.');
  await detail.getByRole('textbox', { name: 'Reason for dismissing' }).fill('A known field');
  await detail.getByRole('button', { name: 'Dismiss finding' }).click();
  await expect(findings).toContainText('No open findings.');
  expect(changed).toEqual([
    { method: 'PATCH', body: { status: 'dismissed', reason: 'A known field' } },
  ]);
  expect(problems).toEqual([]);
});
