import { useSyncExternalStore } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { BookOpen, ChevronDown, Settings, User } from 'lucide-react';
import { NotificationBell } from '../alerts/NotificationBell';
import { useOpenObject } from '../intel/useOpenObject';
import { useStoreKey } from '../state/store';
import { IconButton } from '../ui/Button';
import { Logo } from './Logo';
import { NAV_TABS } from './routes';
import { SearchBox } from './SearchBox';
import type { Session } from './session';
import styles from './TopNav.module.css';

/**
 * The top navigation bar shared by every screen: wordmark, the primary tabs, search (017), the
 * open workspace (025), the notifications bell and inbox (029), settings and the access menu.
 */
export function TopNav({ session }: { session: Session }) {
  const navigate = useNavigate();
  const token = useSyncExternalStore(session.tokens.subscribe, session.tokens.get);
  const workspace = useStoreKey('workspace', session.store);
  const openObject = useOpenObject(session.api, session.store);

  return (
    <nav className={styles.nav} aria-label="Primary">
      <NavLink to="/global" className={styles.brand} aria-label="ForeSignal home">
        <Logo />
        <span className={styles.wordmark}>
          <span className={styles.name}>FORESIGNAL</span>
          <span className={styles.tagline}>INTELLIGENCE. AHEAD.</span>
        </span>
      </NavLink>

      <ul className={styles.tabs}>
        {NAV_TABS.map(({ path, label, icon: Icon }) => (
          <li key={path}>
            <NavLink
              to={path}
              className={({ isActive }) =>
                [styles.tab, isActive && styles.active].filter(Boolean).join(' ')
              }
              title={label}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={styles.right}>
        <SearchBox session={session} />
        <button
          type="button"
          className={styles.workspace}
          onClick={() => session.store.set('workspacesOpen', true)}
          aria-label={workspace ? `Workspace: ${workspace.name}` : 'Workspaces'}
          title={workspace?.error ? `Not saved: ${workspace.error}` : undefined}
        >
          <BookOpen size={15} strokeWidth={1.75} aria-hidden="true" />
          <span className={styles.workspaceName}>{workspace ? workspace.name : 'Workspace'}</span>
          {workspace?.error && <span className={styles.workspaceError} aria-hidden="true" />}
        </button>
        <NotificationBell
          feed={session.inbox}
          hasToken={!!token}
          onOpen={(ref) => void openObject(ref)}
        />
        <IconButton
          label="Settings"
          icon={<Settings size={17} strokeWidth={1.75} />}
          onClick={() => navigate('/settings')}
        />
        <button
          type="button"
          className={styles.user}
          onClick={() => navigate('/settings')}
          aria-label="Access settings"
        >
          <span className={styles.avatar}>
            <User size={15} aria-hidden="true" />
          </span>
          <span className={styles.userText}>
            <span className={styles.userName}>{token ? 'Token access' : 'Open access'}</span>
            <span className={styles.userDetail}>
              {token ? `${token.slice(0, 8)}…` : 'No token'}
            </span>
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
