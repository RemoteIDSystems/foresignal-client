import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createForesignalClient } from '../api/client';
import { createStore, INITIAL_STATE, type AppState } from '../state/store';
import { plainSnippet } from '../search/searchApi';
import { SearchBox } from './SearchBox';
import type { Session } from './session';

/** What the stand-in backend was asked, and how it answers each path. */
let asked: string[] = [];
let answers: Record<string, () => Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status < 400 ? 'application/json' : 'application/problem+json' },
  });

const QUAKE_REF = 'record:usgs-earthquakes/nc1';

beforeEach(() => {
  asked = [];
  answers = {
    '/v1/search/status': () =>
      json({ semanticEnabled: false, reason: 'No embedding provider is assigned.' }),
    '/v1/search': () =>
      json({
        mode: 'text',
        items: [
          {
            docType: 'alert',
            docId: '42',
            score: 0.5,
            title: 'Tsunami watch',
            snippet: 'A <b>tsunami</b> watch is in effect',
          },
          {
            docType: 'record',
            docId: 'r1',
            score: 0.9,
            title: 'M 4.1 - Offshore',
            kind: 'earthquake',
            record: { source: 'usgs-earthquakes', externalId: 'nc1' },
          },
        ],
      }),
    [`/v1/objects/${encodeURIComponent(QUAKE_REF)}/dossier`]: () =>
      json({
        ref: QUAKE_REF,
        generatedAt: '2026-10-20T12:00:00Z',
        envelope: {
          ref: QUAKE_REF,
          type: 'record',
          title: 'M 4.1 - Offshore',
          geometry: { type: 'Point', coordinates: [-125, 40] },
        },
        sections: { overview: { status: 'ok', fields: { kind: 'earthquake' } } },
      }),
  };
});

/** Renders the box on a route, with a stand-in backend; returns the store it selects into. */
function renderBox(path = '/global') {
  const store = createStore<AppState>(INITIAL_STATE);
  const api = createForesignalClient({
    baseUrl: 'http://api.test',
    retry: false,
    fetch: async (request) => {
      const url = new URL(request.url);
      asked.push(url.pathname + url.search);
      const answer = answers[url.pathname];
      return answer ? answer() : json({ title: 'Not Found', status: 404 }, 404);
    },
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<SearchBox session={{ api, store } as unknown as Session} />} />
      </Routes>
    </MemoryRouter>,
  );
  return store;
}

describe('SearchBox', () => {
  it('searches once typing pauses, groups the results, and selects the one picked', async () => {
    const store = renderBox();
    await userEvent.type(screen.getByRole('combobox', { name: 'Search' }), 'quake');
    const results = await screen.findByTestId('search-results');
    await waitFor(() => expect(results).toHaveAttribute('data-state', 'ready'));
    // One search for the whole word, in text mode, as semantic search is not ready.
    expect(asked.filter((path) => path.startsWith('/v1/search?'))).toEqual([
      '/v1/search?q=quake&mode=text&limit=20',
    ]);
    expect(screen.getByTestId('search-mode')).toHaveTextContent(
      'Text search: No embedding provider is assigned.',
    );
    const headings = within(results)
      .getAllByRole('heading')
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Records (1)', 'Alerts (1)']);
    expect(within(results).getByRole('option', { name: /Tsunami watch/ })).toHaveTextContent(
      'A tsunami watch is in effect',
    );
    await userEvent.click(within(results).getByRole('option', { name: /M 4.1 - Offshore/ }));
    await waitFor(() =>
      expect(store.get('selection')?.id).toEqual({
        layer: 'earthquake',
        kind: 'earthquake',
        source: 'usgs-earthquakes',
        externalId: 'nc1',
      }),
    );
    expect(store.get('selection')).toMatchObject({ longitude: -125, latitude: 40 });
    // On the Global dashboard the selection moves the map (014); no separate move is asked for.
    expect(store.get('locate')).toBeUndefined();
  });

  it('from another screen, opens the Global dashboard and asks the map to move to the result', async () => {
    const store = renderBox('/analyst');
    const box = screen.getByRole('combobox', { name: 'Search' });
    await userEvent.type(box, 'quake');
    await screen.findByRole('option', { name: /M 4.1 - Offshore/ });
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(store.get('locate')).toMatchObject({ longitude: -125, latitude: 40 }),
    );
  });

  it('says a token is needed when search refuses an anonymous caller', async () => {
    answers['/v1/search'] = () =>
      json({ title: 'Unauthorized', status: 401, code: 'UNAUTHORIZED' }, 401);
    renderBox();
    await userEvent.type(screen.getByRole('combobox', { name: 'Search' }), 'quake');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search needs an access token, even with open reads. Add one in Settings.',
    );
  });

  it('shows snippets as plain text', () => {
    expect(plainSnippet('A <b>tsunami</b>  watch\n')).toBe('A tsunami watch');
  });
});
