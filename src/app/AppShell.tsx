import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { WorkspacesDialog } from '../workspace/WorkspacesDialog';
import { WorkspaceSyncContext } from '../workspace/workspaceSyncContext';
import { ErrorBoundary } from './ErrorBoundary';
import { TopNav } from './TopNav';
import { VersionBanner } from './VersionBanner';
import type { Session } from './session';
import styles from './AppShell.module.css';

/**
 * The frame every screen lives in: top navigation, the API-version banner, and the routed view,
 * each view behind its own error boundary (reset when the route changes). It starts the workspace
 * binding (025): a deep link in the URL fragment (`#fs=…`) is restored once, then the fragment is
 * cleared, and the Workspaces dialog is available on every screen.
 */
export function AppShell({ session }: { session: Session }) {
  const location = useLocation();
  const { workspaces } = session;
  useEffect(() => {
    const stop = workspaces.start();
    void workspaces.restoreLink(window.location.hash).then((restored) => {
      if (restored) {
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname + window.location.search,
        );
      }
    });
    return stop;
  }, [workspaces]);
  return (
    <WorkspaceSyncContext.Provider value={workspaces}>
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
        <WorkspacesDialog sync={workspaces} store={session.store} />
      </div>
    </WorkspaceSyncContext.Provider>
  );
}
