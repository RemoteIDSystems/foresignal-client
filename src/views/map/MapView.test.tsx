import { render, screen } from '@testing-library/react';
import { createStore, INITIAL_STATE } from '../../state/store';
import { MapView } from './MapView';

describe('MapView', () => {
  it('fills the screen with the map, named for screen readers, with no panels', () => {
    render(<MapView api={undefined} store={createStore(INITIAL_STATE)} />);
    const map = screen.getByRole('region', { name: 'Map' });
    expect(screen.getByRole('heading', { level: 1, name: 'Map' })).toBeInTheDocument();
    expect(map).toHaveAttribute('data-testid', 'full-map');
    expect(screen.queryByRole('region', { name: 'Layers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected entity' })).not.toBeInTheDocument();
  });
});
