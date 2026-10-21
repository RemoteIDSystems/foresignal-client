import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { Tabs } from './Tabs';
import { ToastHost } from './ToastHost';
import { useToast } from './toast-context';

describe('Tabs', () => {
  function Harness() {
    const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
    return (
      <Tabs
        label="Sections"
        value={value}
        onChange={setValue}
        items={[
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
          { key: 'c', label: 'C' },
        ]}
      />
    );
  }

  it('selects on click and moves with the arrow keys, wrapping', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'A' })).toHaveFocus();
  });
});

describe('Panel', () => {
  it('collapses its body and closes through onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Panel title="Insights" collapsible onClose={onClose}>
        <p>body</p>
      </Panel>,
    );
    await user.click(screen.getByRole('button', { name: 'Collapse Insights' }));
    expect(screen.getByRole('button', { name: 'Expand Insights' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close Insights' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('Modal', () => {
  it('renders a labeled dialog and closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open title="Confirm" onClose={onClose}>
        content
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps focus in a field while its owner re-renders with a new onClose', async () => {
    const user = userEvent.setup();
    function Owner() {
      const [name, setName] = useState('');
      return (
        <Modal open title="Name" onClose={() => {}}>
          <input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        </Modal>
      );
    }
    render(<Owner />);
    await user.click(screen.getByRole('textbox', { name: 'Name' }));
    await user.keyboard('Fires');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Fires');
  });

  it('keeps Tab and Shift+Tab inside the dialog, wrapping at either end', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside</button>
        <Modal open title="Confirm" onClose={() => {}}>
          <button type="button">One</button>
          <button type="button">Two</button>
        </Modal>
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Confirm' });
    const inside = within(dialog).getAllByRole('button');
    inside.at(-1)!.focus();
    await user.tab();
    expect(inside[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(inside.at(-1)).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Outside' })).not.toHaveFocus();
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Confirm" onClose={() => {}}>
        content
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ToastHost', () => {
  it('shows a toast, dismisses it on timeout, and on click', async () => {
    vi.useFakeTimers();
    let api: ReturnType<typeof useToast> | undefined;
    const Grab = () => {
      api = useToast();
      return null;
    };
    render(
      <ToastHost>
        <Grab />
      </ToastHost>,
    );
    act(() => {
      api?.show({ title: 'Alert fired', detail: 'Port closure', durationMs: 1000 });
    });
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent('Alert fired');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText('Alert fired')).not.toBeInTheDocument();
    vi.useRealTimers();

    act(() => {
      api?.show({ title: 'Sticky', durationMs: 0 });
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Sticky')).not.toBeInTheDocument();
  });
});
