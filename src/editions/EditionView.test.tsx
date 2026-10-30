import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { App } from '../app/App';
import { createSession } from '../app/session';
import { contract, me, systemInfo } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { ONBOARDED_KEY } from '../onboarding/onboarding';
import type { BriefingRun } from './editionsApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(ONBOARDED_KEY, '1');
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ID = '00000000-0000-4000-8000-000000000001';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Morning Brief</title>
  <item>
    <title>Edition for October 30</title>
    <enclosure url="https://cdn.test/latest.mp3" type="audio/mpeg" length="123456" />
  </item>
</channel></rss>`;

function briefingRun(overrides: Partial<BriefingRun> = {}): BriefingRun {
  return {
    id: '00000000-0000-4000-8000-0000000000ff',
    briefingId: ID,
    status: 'succeeded',
    startedAt: '2026-10-30T07:00:00Z',
    finishedAt: '2026-10-30T07:02:00Z',
    periodFrom: '2026-10-29T07:00:00Z',
    periodTo: '2026-10-30T07:00:00Z',
    contentMarkdown: '# Headline\n\nThe lead story of the day.',
    citations: [
      {
        id: 'c1',
        title: 'Port closure confirmed',
        provenance: {
          refs: ['situation:01JA8Q3V7S2K9W4T6Y1B5N0M3C'],
          reason: 'Matched your watchlist',
        },
        corroboration: {
          evidenceQuality: 'strong',
          independentSources: 3,
          reliability: 'B',
          credibility: 2,
        },
      },
    ],
    ...overrides,
  };
}

function backend(run: BriefingRun = briefingRun()) {
  server.use(
    http.get('/v1/system', ({ response }) => response(200).json(systemInfo())),
    http.get('/v1/contract', ({ response }) => response(200).json(contract())),
    http.put('/v1/tokens/current/device', ({ response }) =>
      response(200).json({
        id: '00000000-0000-4000-8000-000000000001',
        name: 'test',
        scope: 'read',
        tokenPrefix: 'fsr_test',
        createdAt: '2026-10-19T00:00:00Z',
      }),
    ),
    http.get('/v1/me', ({ response }) => response(200).json(me({ permissions: ['data.read'] }))),
    http.get('/v1/me/preferences', ({ response }) =>
      response(200).json({ timezone: null, locale: null, theme: 'system', ui: {} }),
    ),
    http.get('/v1/briefings/{briefingId}/runs/latest', ({ response }) => response(200).json(run)),
    http.get('/v1/editions/{briefingId}/site', ({ response }) =>
      response(200).json({
        briefingId: ID,
        url: 'https://sites.test/canonical',
        shareUrl: 'https://sites.test/share/abc',
      }),
    ),
    http.untyped.get(`${MOCK_BASE_URL}/v1/briefings/${ID}/podcast.rss`, () =>
      HttpResponse.text(RSS, { headers: { 'Content-Type': 'application/rss+xml' } }),
    ),
  );
}

function signedInSession() {
  const session = createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false });
  session.sessions.set({ token: 'fss_live' });
  return session;
}

describe('EditionView', () => {
  it('reads the written edition, plays the spoken one, and shows provenance and corroboration', async () => {
    backend();
    const { container } = render(
      <App session={signedInSession()} initialPath={`/editions/${ID}`} />,
    );

    // Written edition (the run's Markdown body).
    expect(await screen.findByRole('heading', { name: 'Headline' })).toBeInTheDocument();
    expect(screen.getByText('The lead story of the day.')).toBeInTheDocument();

    // Spoken edition: an audio player pointed at the latest enclosure.
    const audio = await waitForAudio(container);
    expect(audio).toHaveAttribute('src', 'https://cdn.test/latest.mp3');

    // Provenance and corroboration badges.
    expect(screen.getByRole('heading', { name: 'Why this is in my paper' })).toBeInTheDocument();
    expect(screen.getByText('Port closure confirmed')).toBeInTheDocument();
    expect(screen.getByText('strong')).toBeInTheDocument();
    expect(screen.getByText(/Matched your watchlist/)).toBeInTheDocument();

    // Share affordance carries the read-only share link.
    const share = await screen.findByLabelText('Share link');
    expect(share).toHaveValue('https://sites.test/share/abc');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('omits the badges when the run carries no citations', async () => {
    backend(briefingRun({ citations: [] }));
    render(<App session={signedInSession()} initialPath={`/editions/${ID}`} />);
    expect(await screen.findByRole('heading', { name: 'Headline' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Why this is in my paper' }),
    ).not.toBeInTheDocument();
  });

  it('offers an anonymous visitor a way to sign in', async () => {
    backend();
    render(
      <App
        session={createSession({ baseUrl: MOCK_BASE_URL, isolated: true, retry: false })}
        initialPath={`/editions/${ID}`}
      />,
    );
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });
});

/** Waits for the audio element to appear once the podcast feed has loaded and parsed. */
async function waitForAudio(container: HTMLElement): Promise<HTMLAudioElement> {
  return screen.findByRole('heading', { name: 'Listen' }).then(() => {
    const audio = container.querySelector('audio');
    if (!audio) throw new Error('audio element not found');
    return audio;
  });
}
