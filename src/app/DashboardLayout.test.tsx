import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Panel } from '../ui/Panel';
import { DashboardLayout, type DockPanel } from './DashboardLayout';

const panels: DockPanel[] = [
  {
    id: 'a',
    title: 'Alpha',
    slot: 'left',
    render: (close) => (
      <Panel title="Alpha" onClose={close}>
        a
      </Panel>
    ),
  },
  {
    id: 'b',
    title: 'Bravo',
    slot: 'right',
    render: (close) => (
      <Panel title="Bravo" onClose={close}>
        b
      </Panel>
    ),
  },
  {
    id: 'c',
    title: 'Charlie',
    slot: 'bottom',
    render: (close) => (
      <Panel title="Charlie" onClose={close}>
        c
      </Panel>
    ),
  },
];

describe('DashboardLayout', () => {
  it('docks each panel into its slot around the map', () => {
    const { container } = render(<DashboardLayout map={<div>MAP</div>} panels={panels} />);
    const slot = (name: string) => container.querySelector(`[data-slot="${name}"]`) as HTMLElement;
    expect(within(slot('left')).getByRole('region', { name: 'Alpha' })).toBeInTheDocument();
    expect(within(slot('right')).getByRole('region', { name: 'Bravo' })).toBeInTheDocument();
    expect(within(slot('bottom')).getByRole('region', { name: 'Charlie' })).toBeInTheDocument();
    expect(within(slot('map')).getByText('MAP')).toBeInTheDocument();
  });

  it('closes a panel, collapses its empty slot, and restores it', async () => {
    const user = userEvent.setup();
    const { container } = render(<DashboardLayout map={<div>MAP</div>} panels={panels} />);
    await user.click(screen.getByRole('button', { name: 'Close Bravo' }));
    expect(screen.queryByRole('region', { name: 'Bravo' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="right"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Bravo' }));
    expect(screen.getByRole('region', { name: 'Bravo' })).toBeInTheDocument();
  });

  it('isolates a panel that throws', () => {
    const Broken = () => {
      throw new Error('boom');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <DashboardLayout
        map={<div>MAP</div>}
        panels={[...panels, { id: 'x', title: 'Broken', slot: 'bottom', render: () => <Broken /> }]}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Broken hit an error');
    expect(screen.getByRole('region', { name: 'Charlie' })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
