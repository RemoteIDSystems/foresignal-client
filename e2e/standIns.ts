import type { Page } from '@playwright/test';
import {
  changes,
  eventMember,
  member,
  situation,
  SITUATION_ID,
  timeline,
} from '../src/intel/testing/fixtures';

/** A page of items, as a route fulfillment. */
export const items = (list: unknown[]) => ({ json: { items: list, nextCursor: null } });

/**
 * Answers the 019 situation's reads (the situation, members, timeline, changes and related
 * objects) with the fixtures, since the local backend has no situations.
 */
export async function standInSituation(page: Page): Promise<void> {
  const base = `/v1/situations/${SITUATION_ID}`;
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
}
