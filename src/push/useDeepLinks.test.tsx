import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { routeOf, useDeepLinks } from './useDeepLinks';
import { OPEN_MESSAGE } from './webPush';

/** Shows the route it is on, and runs the deep links. */
function Probe({ onOpen, container }: { onOpen: (ref: string) => void; container: EventTarget }) {
  useDeepLinks(onOpen, container as ServiceWorkerContainer);
  const location = useLocation();
  return <p data-testid="at">{location.pathname + location.search}</p>;
}

describe('deep links', () => {
  it('maps a worker path under the app base to a route', () => {
    expect(routeOf('/global?open=alert%3A7', '/')).toBe('/global?open=alert%3A7');
    expect(routeOf('/app/alerts', '/app/')).toBe('/alerts');
  });

  it('opens `?open=` once, and follows an activated notification to its route', async () => {
    const onOpen = vi.fn();
    const container = new EventTarget();
    render(
      <MemoryRouter initialEntries={['/global?open=alert%3A7']}>
        <Routes>
          <Route path="*" element={<Probe onOpen={onOpen} container={container} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('alert:7');
    const message = new MessageEvent('message', {
      data: { type: OPEN_MESSAGE, path: '/alerts?tab=rules' },
    });
    container.dispatchEvent(message);
    expect(await screen.findByText('/alerts?tab=rules')).toBeInTheDocument();
  });
});
