import { Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';
import { TopNav } from './TopNav';
import { VersionBanner } from './VersionBanner';
import type { Session } from './session';
import styles from './AppShell.module.css';

/**
 * The frame every screen lives in: top navigation, the API-version banner, and the routed view,
 * each view behind its own error boundary (reset when the route changes).
 */
export function AppShell({ session }: { session: Session }) {
  const location = useLocation();
  return (
    <div className={styles.shell}>
      <TopNav session={session} />
      <div className={styles.banner}>
        <VersionBanner store={session.capabilities} />
      </div>
      <main className={styles.main}>
        <ErrorBoundary key={location.pathname} label="This view">
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
