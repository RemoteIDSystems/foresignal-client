import { Link } from 'react-router';
import { Settings } from './Settings';
import type { Session } from './session';
import styles from './SettingsView.module.css';

/** The Settings screen: the connection, token and pairing panel, and a link to About and credits. */
export function SettingsView({ session }: { session: Session }) {
  return (
    <div className={styles.view}>
      <div className={styles.card}>
        <Settings session={session} />
        <h3>About</h3>
        <p>
          <Link to="/about">About and credits</Link>: version, map imagery sources and open-source
          licenses.
        </p>
      </div>
    </div>
  );
}
