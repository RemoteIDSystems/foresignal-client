import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import {
  createMyEdition,
  deleteMyEdition,
  latestEnclosure,
  listMyEditions,
  runMyEdition,
  shareUrlOf,
  updateMyEdition,
  type Briefing,
  type BriefingInput,
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

const BRIEFING_ID = '00000000-0000-4000-8000-000000000001';

function input(overrides: Partial<BriefingInput> = {}): BriefingInput {
  return {
    name: 'Morning Brief',
    schedule: '0 7 * * *',
    enabled: true,
    timezone: 'UTC',
    mode: 'digest',
    maxItemsPerKind: 5,
    includeProvenance: false,
    includeCorroboration: false,
    ...overrides,
  };
}

function briefing(overrides: Partial<Briefing> = {}): Briefing {
  return { ...input(), id: BRIEFING_ID, createdAt: '2026-10-30T07:00:00Z', ...overrides };
}

describe('createMyEdition', () => {
  it('POSTs the BriefingInput and never sends an ownerUserId', async () => {
    let seen: Record<string, unknown> | undefined;
    server.use(
      http.post('/v1/me/editions', async ({ request, response }) => {
        seen = (await request.json()) as Record<string, unknown>;
        return response(201).json(briefing({ name: 'My Brief' }));
      }),
    );
    const result = await createMyEdition(client(), input({ name: 'My Brief' }));
    expect(result.id).toBe(BRIEFING_ID);
    expect(seen?.name).toBe('My Brief');
    expect(seen).not.toHaveProperty('ownerUserId');
  });
});

describe('updateMyEdition', () => {
  it('PUTs the replacement body to the edition’s path', async () => {
    let seen: Record<string, unknown> | undefined;
    server.use(
      http.put('/v1/me/editions/{briefingId}', async ({ request, params, response }) => {
        expect(params.briefingId).toBe(BRIEFING_ID);
        seen = (await request.json()) as Record<string, unknown>;
        return response(200).json(briefing({ name: 'Renamed' }));
      }),
    );
    const result = await updateMyEdition(client(), BRIEFING_ID, input({ name: 'Renamed' }));
    expect(result.name).toBe('Renamed');
    expect(seen?.name).toBe('Renamed');
    expect(seen).not.toHaveProperty('ownerUserId');
  });
});

describe('deleteMyEdition', () => {
  it('resolves on a 204 and rejects on a 404', async () => {
    server.use(
      http.delete('/v1/me/editions/{briefingId}', ({ response }) => response(204).empty()),
    );
    await expect(deleteMyEdition(client(), BRIEFING_ID)).resolves.toBeUndefined();

    server.use(
      http.delete('/v1/me/editions/{briefingId}', ({ response }) =>
        response(404).json({ type: 'about:blank', title: 'Not found', status: 404 }),
      ),
    );
    await expect(deleteMyEdition(client(), BRIEFING_ID)).rejects.toThrow();
  });
});

describe('runMyEdition', () => {
  it('POSTs to the run path and returns the started run', async () => {
    server.use(
      http.post('/v1/me/editions/{briefingId}/run', ({ params, response }) => {
        expect(params.briefingId).toBe(BRIEFING_ID);
        return response(202).json({
          status: 'running',
          startedAt: '2026-10-30T07:00:00Z',
          periodFrom: '2026-10-29T07:00:00Z',
          periodTo: '2026-10-30T07:00:00Z',
          contentMarkdown: '',
        });
      }),
    );
    const run = await runMyEdition(client(), BRIEFING_ID);
    expect(run.status).toBe('running');
  });
});
