import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { json, standInApi } from '../../intel/testing/standIn';
import { NOW, TRUECOLOR } from '../../imagery/testing/imageryFixtures';
import { createStore, INITIAL_STATE } from '../../state/store';
import { ImageryView } from './ImageryView';

function renderView(path: string) {
  const { api } = standInApi({
    'GET /v1/products': () => json({ items: [TRUECOLOR], nextCursor: null }),
    'GET /v1/sensors': () => json({ from: '', to: '', items: [], note: '' }),
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <ImageryView api={api} store={createStore(INITIAL_STATE)} />
    </MemoryRouter>,
  );
}

describe('the Imagery screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('opens on Recent Imagery, and lists an external product’s latest day', async () => {
    renderView('/imagery');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Imagery');
    expect(screen.getByRole('tab', { name: 'Recent Imagery' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      await screen.findByRole('button', { name: `${TRUECOLOR.title}, 2026-10-19 00:00Z` }),
    ).toBeInTheDocument();
  });

  it('opens the comparison from the Change Detection link, and switches between them', async () => {
    renderView('/imagery?tab=change');
    expect(await screen.findByTestId('imagery-comparison')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Recent Imagery' }));
    expect(await screen.findByTestId('recent-imagery')).toBeInTheDocument();
    expect(screen.queryByTestId('imagery-comparison')).not.toBeInTheDocument();
  });
});
