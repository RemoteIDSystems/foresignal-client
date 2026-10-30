import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import {
  latestEnclosure,
  listMyEditions,
  shareUrlOf,
  type EditionSite,
  type EditionSummary,
} from './editionsApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

function edition(overrides: Partial<EditionSummary> = {}): EditionSummary {
  return {
    briefingId: '00000000-0000-4000-8000-000000000001',
    name: 'Morning Brief',
    enabled: true,
    schedule: '0 7 * * *',
    timezone: 'UTC',
    ...overrides,
  };
}

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Morning Brief</title>
  <item>
    <title>Edition for October 30</title>
    <enclosure url="https://cdn.test/latest.mp3" type="audio/mpeg" length="123456" />
  </item>
  <item>
    <title>Edition for October 29</title>
    <enclosure url="https://cdn.test/older.mp3" type="audio/mpeg" length="120000" />
  </item>
</channel></rss>`;

describe('latestEnclosure', () => {
  it('returns the newest item’s enclosure (feeds are newest-first)', () => {
    expect(latestEnclosure(RSS)).toEqual({
      url: 'https://cdn.test/latest.mp3',
      type: 'audio/mpeg',
      title: 'Edition for October 30',
    });
  });

  it('is null for an empty feed, a feed without an enclosure, and malformed XML', () => {
    expect(latestEnclosure('')).toBeNull();
    expect(latestEnclosure('   ')).toBeNull();
    expect(
      latestEnclosure('<rss><channel><item><title>No audio</title></item></channel></rss>'),
    ).toBeNull();
    expect(latestEnclosure('<rss><channel><item>')).toBeNull();
  });
});

describe('shareUrlOf', () => {
  const site = (overrides: Partial<EditionSite>): EditionSite => ({
    briefingId: '00000000-0000-4000-8000-000000000001',
    url: 'https://sites.test/canonical',
    ...overrides,
  });

  it('prefers the revocable share link', () => {
    expect(shareUrlOf(site({ shareUrl: 'https://sites.test/share/abc' }))).toBe(
      'https://sites.test/share/abc',
    );
  });

  it('falls back to the canonical URL, and is null without either', () => {
    expect(shareUrlOf(site({ shareUrl: null }))).toBe('https://sites.test/canonical');
    expect(shareUrlOf(null)).toBeNull();
    expect(shareUrlOf(undefined)).toBeNull();
  });
});

describe('listMyEditions', () => {
  it('reads the caller’s editions page', async () => {
    server.use(
      http.get('/v1/me/editions', ({ response }) =>
        response(200).json({ items: [edition()], nextCursor: null }),
      ),
    );
    const result = await listMyEditions(client());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('Morning Brief');
  });
});
