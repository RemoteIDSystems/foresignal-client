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
  hypothesisSet,
  indicators,
  informationValue,
  matrix,
  SET_ID,
  setEnvelope,
} from '../src/intel/testing/hypothesisFixtures';
import { collectProblems } from './support';

/**
 * The Hypotheses tab (021). The local backend has no situations or hypothesis sets, so the
 * situation and hypothesis reads are stand-ins (the 019 and 021 fixtures).
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
});

/** Answers the situation and hypothesis reads. */
async function standIn(page: Page) {
  const base = `/v1/situations/${SITUATION_ID}`;
  const set = `/v1/hypotheses/sets/${SET_ID}`;
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
  await page.route(/\/v1\/hypotheses\/sets(\?.*)?$/, (route) =>
    route.fulfill(items([hypothesisSet])),
  );
  await page.route(new RegExp(`${set}$`), (route) => route.fulfill({ json: hypothesisSet }));
  await page.route(new RegExp(`${set}/matrix$`), (route) => route.fulfill({ json: matrix }));
  await page.route(new RegExp(`${set}/information-value$`), (route) =>
    route.fulfill({ json: informationValue }),
  );
  await page.route(/\/v1\/indicators(\?.*)?$/, (route) => route.fulfill(items(indicators)));
  await page.route(/\/v1\/objects\/hypothesis-set%3A[^/]+$/, (route) =>
    route.fulfill({ json: setEnvelope }),
  );
}

test('the Hypotheses tab lists the competing hypotheses and opens the ACH matrix', async ({
  page,
}) => {
  await standIn(page);
  await page.goto(`/intelligence/situations/${SITUATION_ID}`);
  await expect(page.getByRole('img', { name: 'Information value High' })).toBeVisible();
  await page.getByRole('tab', { name: 'Hypotheses' }).click();
  await expect(page).toHaveURL(/tab=hypotheses/);

  const panel = page.getByTestId('hypotheses-panel');
  await expect(panel).toContainText(hypothesisSet.question);
  const rows = panel.getByTestId('hypothesis-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByTestId('hypothesis-probability')).toHaveText('72% ↑');
  await expect(rows.nth(0).getByTestId('hypothesis-indicators')).toContainText('Indicators: 2/3');
  await expect(panel.getByRole('button', { name: 'Add hypothesis' })).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Pending indicators by information value' })
      .getByRole('listitem'),
  ).toHaveCount(2);

  await panel.getByRole('button', { name: 'View hypothesis analysis →' }).click();
  const table = page.getByRole('table', { name: 'ACH matrix' });
  await expect(table.getByTestId('ach-row')).toHaveCount(2);
  await expect(table.getByTestId('ach-scores')).toContainText('Least inconsistent');
  expect(problems).toEqual([]);
});
