import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { situationSummary, SITUATION_ID } from '../../intel/testing/fixtures';
import { json, standInApi } from '../../intel/testing/standIn';
import { IntelligenceHome } from './IntelligenceHome';

describe('IntelligenceHome', () => {
  it('lists situations by status, asks for a token for investigations, and opens a situation', async () => {
    const { api, asked } = standInApi({
      'GET /v1/situations': () => json({ items: [situationSummary], nextCursor: null }),
      'GET /v1/investigations': () =>
        json({ title: 'Unauthorized', status: 401, detail: 'This operation needs a token.' }, 401),
    });
    render(
      <MemoryRouter initialEntries={['/intelligence']}>
        <Routes>
          <Route path="/intelligence" element={<IntelligenceHome api={api} />} />
          <Route path="/intelligence/situations/:id" element={<p>Situation opened</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const list = await screen.findByRole('list', { name: 'Situations' });
    expect(list).toHaveTextContent('Northern California Seismic Swarm');
    expect(list).toHaveTextContent('2 members');
    const query = new URLSearchParams(asked[0]!.split('?')[1]);
    expect(query.getAll('status').join(',')).toBe('emerging,active');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Investigations need an access token, even with open reads. Add one in Settings.',
    );
    await userEvent.click(within(list).getByRole('button', { name: /Northern California/ }));
    expect(await screen.findByText('Situation opened')).toBeInTheDocument();
    expect(SITUATION_ID).toHaveLength(26);
  });
});
