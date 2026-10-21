import { X } from 'lucide-react';
import { useStoreKey, type AppState, type Store } from '../state/store';
import { Button, IconButton } from '../ui/Button';
import { markOnboarded, WELCOME_STEPS } from './onboarding';
import styles from '../shortcuts/Shortcuts.module.css';

/**
 * The first-run welcome (036): three short steps on the layout rails, the map modes, search and
 * the shortcuts, under the top bar. It sits in the page rather than over it, so nothing beneath
 * is covered, and once dismissed this browser does not show it again (the shortcuts overlay can).
 */
export function WelcomeCard({ store }: { store: Store<AppState> }) {
  const open = useStoreKey('welcomeOpen', store);
  if (!open) return null;
  const dismiss = () => {
    markOnboarded();
    store.set('welcomeOpen', false);
  };
  return (
    <section className={styles.welcome} aria-label="Welcome to ForeSignal" data-testid="welcome">
      <div className={styles.welcomeHead}>
        <h2 className={styles.welcomeTitle}>Welcome to ForeSignal</h2>
        <IconButton label="Dismiss the welcome" icon={<X size={14} />} onClick={dismiss} />
      </div>
      <ol className={styles.steps}>
        {WELCOME_STEPS.map((step) => (
          <li key={step.title}>
            <strong>{step.title}.</strong> {step.text}
          </li>
        ))}
      </ol>
      <div className={styles.welcomeActions}>
        <Button
          variant="ghost"
          onClick={() =>
            store.batch(() => {
              dismiss();
              store.set('shortcutsOpen', true);
            })
          }
        >
          See the shortcuts
        </Button>
        <Button variant="primary" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </section>
  );
}
