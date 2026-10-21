import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { ONBOARDED_KEY } from '../onboarding/onboarding';
import { WelcomeCard } from '../onboarding/WelcomeCard';
import { createStore, INITIAL_STATE } from '../state/store';
import { ShortcutsDialog } from './ShortcutsDialog';
import { ShortcutRegistry } from './shortcuts';

describe('ShortcutsDialog', () => {
  it('lists the registered shortcuts by group, with their keys', () => {
    const store = createStore({ ...INITIAL_STATE, shortcutsOpen: true });
    const registry = new ShortcutRegistry();
    registry.register([
      { id: 'help', key: '?', description: 'Show the keyboard shortcuts', group: 'General' },
      { id: 'mode', key: 'm', label: 'M', description: 'Switch the map', group: 'Map' },
    ]);
    render(<ShortcutsDialog store={store} registry={registry} />);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const map = within(dialog).getByRole('region', { name: 'Map' });
    expect(within(map).getByText('M')).toBeInTheDocument();
    expect(within(map).getByText('Switch the map')).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: 'General' })).toHaveTextContent('?');
  });

  it('follows the registry while open', () => {
    const store = createStore({ ...INITIAL_STATE, shortcutsOpen: true });
    const registry = new ShortcutRegistry();
    render(<ShortcutsDialog store={store} registry={registry} />);
    expect(screen.queryByText('Step the time back 10 minutes')).not.toBeInTheDocument();
    act(() => {
      registry.register([
        { id: 'back', key: '[', description: 'Step the time back 10 minutes', group: 'Time' },
      ]);
    });
    expect(screen.getByText('Step the time back 10 minutes')).toBeInTheDocument();
  });

  it('shows the welcome again from its footer', async () => {
    const store = createStore({ ...INITIAL_STATE, shortcutsOpen: true });
    render(<ShortcutsDialog store={store} registry={new ShortcutRegistry()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show the welcome again' }));
    expect(store.get('shortcutsOpen')).toBe(false);
    expect(store.get('welcomeOpen')).toBe(true);
  });

  it('renders nothing while closed', () => {
    render(
      <ShortcutsDialog store={createStore(INITIAL_STATE)} registry={new ShortcutRegistry()} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('WelcomeCard', () => {
  beforeEach(() => localStorage.clear());

  it('shows its three steps and, dismissed, is remembered', async () => {
    const store = createStore({ ...INITIAL_STATE, welcomeOpen: true });
    render(<WelcomeCard store={store} />);
    const card = screen.getByRole('region', { name: 'Welcome to ForeSignal' });
    expect(within(card).getAllByRole('listitem')).toHaveLength(3);
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Got it' }));
    expect(store.get('welcomeOpen')).toBe(false);
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe('1');
    expect(screen.queryByRole('region', { name: 'Welcome to ForeSignal' })).not.toBeInTheDocument();
  });

  it('opens the shortcuts from its button', async () => {
    const store = createStore({ ...INITIAL_STATE, welcomeOpen: true });
    render(<WelcomeCard store={store} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'See the shortcuts' }));
    expect(store.get('shortcutsOpen')).toBe(true);
    expect(store.get('welcomeOpen')).toBe(false);
  });

  it('dismisses from its close button', async () => {
    const store = createStore({ ...INITIAL_STATE, welcomeOpen: true });
    render(<WelcomeCard store={store} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss the welcome' }));
    expect(store.get('welcomeOpen')).toBe(false);
  });
});
