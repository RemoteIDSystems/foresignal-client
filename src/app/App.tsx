import { Settings } from './Settings';
import { VersionBanner } from './VersionBanner';
import type { Session } from './session';

/**
 * Root component of the ForeSignal Client.
 *
 * Until prompt 004 builds the shell and dashboard, it shows the version banner and the Settings
 * panel.
 */
export function App({ session }: { session: Session }) {
  return (
    <main>
      <h1>ForeSignal Client</h1>
      <VersionBanner store={session.capabilities} />
      <Settings session={session} />
    </main>
  );
}
