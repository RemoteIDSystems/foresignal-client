import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapHud, type CameraState, type MapHudProps } from './MapHud';

/** Renders the HUD with spy actions; returns the spies. */
function renderHud(camera: CameraState | undefined, overrides: Partial<MapHudProps> = {}) {
  const actions = {
    onSceneMode: vi.fn(),
    onResetNorth: vi.fn(),
    onZoom: vi.fn(),
    onHome: vi.fn(),
  };
  render(
    <MapHud
      mode="3d"
      camera={camera}
      insetTiles={['/w.jpg', '/e.jpg']}
      {...actions}
      {...overrides}
    />,
  );
  return actions;
}

const camera: CameraState = {
  latitude: 28,
  longitude: -80,
  height: 13_000_000,
  heading: 30,
  view: { west: -120, south: 0, east: -40, north: 50 },
  scale: { pixels: 49, meters: 2_000_000, label: '2,000 km' },
};

describe('MapHud', () => {
  it('shows dashes before the camera is known', () => {
    renderHud(undefined);
    expect(screen.getByTestId('readout-lat')).toHaveTextContent('—');
    expect(screen.getByTestId('readout-elev')).toHaveTextContent('—');
    expect(screen.queryByTestId('scale')).toBeNull();
  });

  it('shows lat, lon, elevation, scale and the inset view box', () => {
    renderHud(camera);
    expect(screen.getByTestId('readout-lat')).toHaveTextContent('28.0000°');
    expect(screen.getByTestId('readout-lon')).toHaveTextContent('-80.0000°');
    expect(screen.getByTestId('readout-elev')).toHaveTextContent('13,000 km');
    expect(screen.getByTestId('scale')).toHaveTextContent('2,000 km');
    expect(screen.getAllByTestId('inset-box')).toHaveLength(1);
  });

  it('turns the compass needle against the heading', () => {
    renderHud(camera);
    expect(screen.getByTestId('compass-needle')).toHaveStyle({ transform: 'rotate(-30deg)' });
  });

  it('marks the current mode and reports a mode change', async () => {
    const user = userEvent.setup();
    const { onSceneMode } = renderHud(camera, { mode: 'split' });
    expect(screen.getByRole('tab', { name: 'Split' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: '2D Map' }));
    expect(onSceneMode).toHaveBeenCalledWith('2d');
  });

  it('drives zoom, reset north and home', async () => {
    const user = userEvent.setup();
    const actions = renderHud(camera);
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    await user.click(screen.getByRole('button', { name: 'Reset north' }));
    await user.click(screen.getByRole('button', { name: 'Home view' }));
    expect(actions.onZoom.mock.calls).toEqual([[1], [-1]]);
    expect(actions.onResetNorth).toHaveBeenCalledOnce();
    expect(actions.onHome).toHaveBeenCalledOnce();
  });
});
