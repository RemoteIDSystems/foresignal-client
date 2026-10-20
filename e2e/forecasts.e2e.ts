import { expect, test, type Page } from '@playwright/test';
import {
  changes,
  eventMember,
  member,
  situation,
  SITUATION_ID,
  timeline,
} from '../src/intel/testing/fixtures';
import {
  emptyHistory,
  forecasts,
  outageDetail,
  outageHistory,
  outageQuestion,
  questions,
} from '../src/intel/testing/forecastFixtures';
import { collectProblems } from './support';

/**
 * The Forecasts tab (022). The local backend has no situations or forecast questions, so those
 * reads are stand-ins (the 019 and 022 fixtures); the ledger's scorecard and calibration are the
 * live backend's, drawn by ECharts.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
});

/** Answers the situation and question reads. */
async function standIn(page: Page) {
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
  await page.route(/\/v1\/forecasts\/questions(\?.*)?$/, (route) =>
    route.fulfill(items(questions)),
  );
  await page.route(/\/v1\/forecasts\/questions\/[^/]+\/history(\?.*)?$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[4]!;
    return route.fulfill({ json: id === outageQuestion.id ? outageHistory : emptyHistory(id) });
  });
  await page.route(new RegExp(`/v1/forecasts/questions/${outageQuestion.id}$`), (route) =>
    route.fulfill({ json: outageDetail }),
  );
  await page.route(
    new RegExp(`/v1/forecasts/questions/${outageQuestion.id}/forecasts(\\?.*)?$`),
    (route) => route.fulfill(items(forecasts)),
  );
}

test('the Forecasts tab lists questions with trends, and the ledger draws the live calibration', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await standIn(page);
  await page.goto(`/intelligence/situations/${SITUATION_ID}?tab=forecasts`);

  const panel = page.getByTestId('forecasts-panel');
  const rows = panel.getByTestId('forecast-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByTestId('forecast-probability')).toHaveText('74% ↑');
  const trend = rows.nth(0).getByRole('img', { name: /probability by day$/ });
  await expect(trend).toHaveAttribute('data-points', '10');
  await expect(trend.locator('polyline')).toBeVisible();
  await panel.getByRole('tab', { name: '6 months' }).click();
  await expect(rows).toHaveCount(3);

  // A question's history, every forecaster's line, on an ECharts canvas.
  await rows.nth(0).getByRole('button', { name: outageQuestion.title }).click();
  const history = page.getByTestId('question-history');
  await expect(history).toHaveAttribute('data-series', '2');
  await expect(history.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Close question' }).click();

  // The ledger: the live scorecard and calibration.
  const scorecard = page.waitForResponse((r) => r.url().includes('/v1/forecasts/scorecard'));
  await panel.getByRole('button', { name: 'View forecast ledger →' }).click();
  const answered = (await (await scorecard).json()) as { entries: unknown[] };
  await expect(page.getByTestId('scorecard')).toContainText('Scorer');
  if (answered.entries.length === 0) {
    await expect(page.getByTestId('scorecard')).toContainText(
      'No questions have resolved and been scored yet.',
    );
  } else {
    await expect(page.getByRole('table', { name: 'Scorecard' }).getByRole('row')).toHaveCount(
      answered.entries.length + 1,
    );
  }
  const chart = page.getByTestId('calibration-chart');
  await expect(chart.locator('canvas')).toBeVisible();
  expect((await chart.boundingBox())!.height).toBe(260);
  expect(problems).toEqual([]);
});
