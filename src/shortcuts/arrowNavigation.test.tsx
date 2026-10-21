import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nextItem, useArrowNavigation } from './arrowNavigation';

describe('nextItem', () => {
  const items = [{ id: 'a' }, { id: 'b', disabled: true }, { id: 'c' }, { id: 'd' }];

  it('moves down and up, skipping disabled items and stopping at the ends', () => {
    expect(nextItem(items, items[0], 'ArrowDown')).toBe(items[2]);
    expect(nextItem(items, items[2], 'ArrowUp')).toBe(items[0]);
    expect(nextItem(items, items[0], 'ArrowUp')).toBe(items[0]);
    expect(nextItem(items, items[3], 'ArrowDown')).toBe(items[3]);
  });

  it('goes to the ends on Home and End, and ignores other keys', () => {
    expect(nextItem(items, items[2], 'Home')).toBe(items[0]);
    expect(nextItem(items, items[0], 'End')).toBe(items[3]);
    expect(nextItem(items, items[0], 'ArrowRight')).toBeUndefined();
    expect(nextItem([], undefined, 'ArrowDown')).toBeUndefined();
  });
});

describe('useArrowNavigation', () => {
  function Rail() {
    const onKeyDown = useArrowNavigation('button');
    return (
      <nav aria-label="Rail" onKeyDown={onKeyDown}>
        <button type="button">First</button>
        <button type="button" disabled>
          Off
        </button>
        <button type="button">Second</button>
        <button type="button">Third</button>
      </nav>
    );
  }

  it('walks the rail with the arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    render(<Rail />);
    screen.getByRole('button', { name: 'First' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Third' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });
});
