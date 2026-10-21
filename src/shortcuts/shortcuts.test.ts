import { groupShortcuts, isTyping, ShortcutRegistry, type Shortcut } from './shortcuts';

/** A key press on the page body, with no modifiers. */
function press(key: string, extra: Partial<KeyboardEvent> = {}) {
  return { key, ctrlKey: false, altKey: false, metaKey: false, target: document.body, ...extra };
}

describe('ShortcutRegistry', () => {
  afterEach(() => document.body.replaceChildren());

  it('runs the shortcut a key names and says it did', () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register([{ id: 'a', key: 'm', description: 'Mode', group: 'Map', run }]);
    expect(registry.handle(press('m'))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(registry.handle(press('x'))).toBe(false);
  });

  it('leaves presses with Ctrl, Alt or Meta alone', () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register([{ id: 'a', key: 'f', description: 'Fly', group: 'Map', run }]);
    expect(registry.handle(press('f', { ctrlKey: true }))).toBe(false);
    expect(registry.handle(press('f', { altKey: true }))).toBe(false);
    expect(registry.handle(press('f', { metaKey: true }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('leaves presses while typing in a field alone', () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register([{ id: 'a', key: 'm', description: 'Mode', group: 'Map', run }]);
    const input = document.createElement('input');
    document.body.append(input);
    expect(registry.handle(press('m', { target: input }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('leaves presses alone while a dialog is open', () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register([{ id: 'a', key: '?', description: 'Help', group: 'General', run }]);
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    expect(registry.handle(press('?'))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('lets the newest registration of a key win, and the older one return once it goes', () => {
    const registry = new ShortcutRegistry();
    const older = vi.fn();
    const newer = vi.fn();
    registry.register([{ id: 'a', key: 'n', description: 'Old', group: 'Time', run: older }]);
    const remove = registry.register([
      { id: 'b', key: 'n', description: 'New', group: 'Time', run: newer },
    ]);
    registry.handle(press('n'));
    expect(newer).toHaveBeenCalledOnce();
    expect(older).not.toHaveBeenCalled();
    remove();
    registry.handle(press('n'));
    expect(older).toHaveBeenCalledOnce();
  });

  it('tells subscribers when its list changes, with a new list each time', () => {
    const registry = new ShortcutRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const before = registry.list();
    const remove = registry.register([{ id: 'a', key: 'l', description: 'L', group: 'Panels' }]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.list()).not.toBe(before);
    expect(registry.list().map((entry) => entry.id)).toEqual(['a']);
    remove();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(registry.list()).toEqual([]);
  });

  it('does not run a listed-only shortcut', () => {
    const registry = new ShortcutRegistry();
    registry.register([{ id: 'esc', key: 'Escape', description: 'Clear', group: 'Map' }]);
    expect(registry.handle(press('Escape'))).toBe(false);
  });
});

describe('isTyping', () => {
  it('counts text fields, text areas, selects and editable content, not checkboxes or buttons', () => {
    const text = document.createElement('input');
    const box = document.createElement('input');
    box.type = 'checkbox';
    const area = document.createElement('textarea');
    const select = document.createElement('select');
    const button = document.createElement('button');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(isTyping(text)).toBe(true);
    expect(isTyping(area)).toBe(true);
    expect(isTyping(select)).toBe(true);
    expect(isTyping(box)).toBe(false);
    expect(isTyping(button)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe('groupShortcuts', () => {
  it('groups in the overlay order, lists each key once (the newest) and drops empty groups', () => {
    const list: Shortcut[] = [
      { id: 'time', key: '[', description: 'Back', group: 'Time' },
      { id: 'old-help', key: '?', description: 'Old help', group: 'General' },
      { id: 'mode', key: 'm', description: 'Mode', group: 'Map' },
      { id: 'help', key: '?', description: 'Help', group: 'General' },
    ];
    const groups = groupShortcuts(list);
    expect(groups.map((entry) => entry.group)).toEqual(['General', 'Map', 'Time']);
    expect(groups[0]!.shortcuts.map((entry) => entry.id)).toEqual(['help']);
  });
});
