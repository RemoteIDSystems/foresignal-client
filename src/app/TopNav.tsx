import { useSyncExternalStore } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { Bell, ChevronDown, Search, Settings, User } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { Logo } from './Logo';
import { NAV_TABS } from './routes';
import type { Session } from './session';
import styles from './TopNav.module.css';

/**
 * The top navigation bar shared by every screen: wordmark, the primary tabs, search (wired in
 * 017), notifications (wired in 029), settings and the access menu.
 */
export function TopNav({ session }: { session: Session }) {
  const navigate = useNavigate();
  const token = useSyncExternalStore(session.tokens.subscribe, session.tokens.get);

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
        <label className={styles.search} title="Search is wired in prompt 017">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search entities, locations, events…"
            aria-label="Search"
            readOnly
          />
        </label>
        <IconButton label="Notifications" icon={<Bell size={17} strokeWidth={1.75} />} />
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
