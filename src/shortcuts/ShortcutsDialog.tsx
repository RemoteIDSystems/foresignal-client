import { useCallback } from 'react';
import { useStoreKey, type AppState, type Store } from '../state/store';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { groupShortcuts, shortcuts, useShortcutList, type ShortcutRegistry } from './shortcuts';
import styles from './Shortcuts.module.css';

/** Props for {@link ShortcutsDialog}. */
export interface ShortcutsDialogProps {
  store: Store<AppState>;
  registry?: ShortcutRegistry;
}

/**
 * The keyboard shortcuts overlay (036), in the dashboard's modal: every shortcut that works on the
 * screen shown now, by group, with its key. It opens with `?` or the top bar's keyboard button,
 * and can show the welcome again.
 */
export function ShortcutsDialog({ store, registry = shortcuts }: ShortcutsDialogProps) {
  const open = useStoreKey('shortcutsOpen', store);
  const list = useShortcutList(registry);
  const close = useCallback(() => store.set('shortcutsOpen', false), [store]);
  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={close}>
      <div className={styles.groups} data-testid="shortcuts-dialog">
        {groupShortcuts(list).map(({ group, shortcuts: entries }) => (
          <section key={group} className={styles.group} aria-label={group}>
            <h3 className={styles.groupTitle}>{group}</h3>
            <dl className={styles.list}>
              {entries.map((shortcut) => (
                <div key={shortcut.id} className={styles.row}>
                  <dt>
                    <kbd className={styles.key}>{shortcut.label ?? shortcut.key}</kbd>
                  </dt>
                  <dd>{shortcut.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className={styles.footer}>
        <Button
          variant="ghost"
          onClick={() =>
            store.batch(() => {
              store.set('shortcutsOpen', false);
              store.set('welcomeOpen', true);
            })
          }
        >
          Show the welcome again
        </Button>
      </div>
    </Modal>
  );
}
