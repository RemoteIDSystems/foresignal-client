import type { Page, Route } from '@playwright/test';
import { me } from '../src/annotations/testing/annotationFixtures';
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

/** The token-only reads the screens make, and what each answers when empty (OpenAPI shapes). */
const TOKEN_ONLY_READS: [RegExp, unknown][] = [
  [/\/v1\/exports$/, { items: [], nextCursor: null }],
  [/\/v1\/channels$/, []],
  [/\/v1\/channels\/types$/, []],
  [/\/v1\/sinks$/, { items: [], nextCursor: null }],
  [/\/v1\/push\/devices$/, []],
  [/\/v1\/push\/subscriptions$/, []],
  [/\/v1\/escalation-policies$/, []],
  [/\/v1\/chronicles$/, { items: [], nextCursor: null }],
  [/\/v1\/watchlists$/, { items: [], nextCursor: null }],
  [/\/v1\/places$/, { items: [], nextCursor: null }],
  [/\/v1\/workspaces$/, { items: [], nextCursor: null }],
  [/\/v1\/investigations$/, { items: [], nextCursor: null }],
  [/\/v1\/notifications$/, { items: [], nextCursor: null }],
  [/\/v1\/notifications\/badge$/, { unread: 0, unreadCritical: 0, latestId: null }],
];

/**
 * Runs the page with a test token against the local backend, which does not know it. The
 * token-only calls the screens make on their own are stood in (empty reads, a minted ticket, the
 * device and presence reports), and every other request goes to the backend as an open read:
 * without the token, and without the stood-in ticket. A spec's own routes, added after, win.
 */
export async function standInTestToken(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('foresignal.token', 'fs_e2e_token'));
  await page.route(/\/v1\//, (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'GET') {
      const read = TOKEN_ONLY_READS.find(([pattern]) => pattern.test(path));
      if (read) return route.fulfill({ json: read[1] });
      if (/\/v1\/me$/.test(path)) return route.fulfill({ json: me('agent') });
    }
    if (request.method() === 'POST' && /\/v1\/stream-tickets$/.test(path)) {
      const { purpose } = JSON.parse(request.postData() ?? '{}') as { purpose?: string };
      const expiresAt = new Date(Date.now() + 600_000).toISOString();
      return route.fulfill({
        status: 201,
        json: { ticket: 'fst_e2e', purpose: purpose ?? 'stream', expiresAt },
      });
    }
    if (request.method() === 'POST' && /\/v1\/clients\/presence$/.test(path)) {
      const { state } = JSON.parse(request.postData() ?? '{}') as { state?: string };
      const expiresAt = new Date(Date.now() + 120_000).toISOString();
      return route.fulfill({ json: { deviceKey: 'e2e', kind: 'web', state, expiresAt } });
    }
    if (request.method() === 'PUT' && /\/v1\/tokens\/current\/device$/.test(path)) {
      return route.fulfill({ json: {} });
    }
    const headers = { ...request.headers() };
    delete headers.authorization;
    url.searchParams.delete('ticket');
    return route.continue({ url: url.toString(), headers });
  });
}

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
