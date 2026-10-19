import { Settings } from './Settings';
import type { Session } from './session';
import styles from './SettingsView.module.css';

/** The Settings screen: the connection, token and pairing panel in the app's chrome. */
export function SettingsView({ session }: { session: Session }) {
  return (
    <div className={styles.view}>
      <div className={styles.card}>
        <Settings session={session} />
      </div>
    </div>
  );
}
