import { render, screen } from '@testing-library/react';
import { MapViewer } from './Viewer';
import { supportsWebGL } from './view';

// jsdom has no WebGL (test-setup returns null from getContext), so these cover the fallback path.
// The WebGL path is proven in a real browser by the Playwright check against the production build.
describe('MapViewer without WebGL', () => {
  it('detects that WebGL is unavailable', () => {
    expect(supportsWebGL()).toBe(false);
  });

  it('says why there is no map instead of rendering the viewer', () => {
    render(
      <MapViewer>
        <span>overlay</span>
      </MapViewer>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The map needs WebGL');
    expect(screen.queryByTestId('map-viewer')).toBeNull();
  });
});
