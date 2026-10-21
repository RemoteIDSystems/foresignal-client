import { expect, test } from '@playwright/test';
import { SITUATION_ID } from '../src/intel/testing/fixtures';
import {
  assessment,
  ASSESSMENT_ID,
  bundle,
  situationEnvelope,
} from '../src/intel/testing/assessmentFixtures';
import { items, standInSituation } from './standIns';
import { collectProblems } from './support';

/**
 * The Full Analysis tab (023). The local backend has no situations or assessments, so those reads
 * are stand-ins (the 019 and 023 fixtures).
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
});

test('the AI Analysis tabs render the latest assessment, and a cited object opens', async ({
  page,
}) => {
  await standInSituation(page);
  await page.route(new RegExp(`/v1/situations/${SITUATION_ID}/assessments(\\?.*)?$`), (route) =>
    route.fulfill(items([assessment])),
  );
  await page.route(new RegExp(`/v1/assessments/${ASSESSMENT_ID}(\\?.*)?$`), (route) =>
    route.fulfill({ json: assessment }),
  );
  await page.route(new RegExp(`/v1/assessments/${ASSESSMENT_ID}/bundle(\\?.*)?$`), (route) =>
    route.fulfill({ json: bundle }),
  );
  await page.route(/\/v1\/objects\/situation%3A[^/]+$/, (route) =>
    route.fulfill({ json: situationEnvelope }),
  );
  await page.goto(`/intelligence/situations/${SITUATION_ID}`);
  await page.getByRole('tab', { name: 'Full Analysis' }).click();

  const meta = page.getByTestId('assessment-meta');
  await expect(meta).toContainText('claude-opus-5-5');
  await expect(meta).toContainText('mixed');
  await expect(page.getByTestId('takeaway')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Re-run' })).toBeVisible();

  const strip = page.getByRole('tablist', { name: 'AI Analysis sections' });
  for (const name of [
    'Key Insights',
    'What Changed',
    'Outlook',
    'Risks',
    'Analyst Notes',
    'More',
  ]) {
    await strip.getByRole('tab', { name }).click();
    await expect(page.getByTestId('ai-tab')).toBeVisible();
  }
  await strip.getByRole('tab', { name: 'Risks' }).click();
  await expect(page.getByTestId('ai-tab')).toContainText(
    'A larger earthquake cannot be ruled out.',
  );

  // Checked before leaving: the Global dashboard reads the live backend, which may lack the record.
  expect(problems).toEqual([]);
  await page
    .getByTestId('cited-objects')
    .getByRole('button', { name: /M 4.6 - 10 km NE of The Geysers/ })
    .click();
  await expect(page).toHaveURL(/\/global/);
});
