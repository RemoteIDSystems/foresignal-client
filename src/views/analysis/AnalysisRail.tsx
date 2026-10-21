import { useArrowNavigation } from '../../shortcuts/arrowNavigation';
import { appStore, type AppState, type Store } from '../../state/store';
import { useWorkspaceSync } from '../../workspace/workspaceSyncContext';
import { ANALYSIS_ENTRIES, TOOL_ENTRIES, type RailEntry } from './frame';
import styles from './Analysis.module.css';

/**
 * The full-analysis left rail (019), as the Conflict mock draws it: ANALYSIS (Situations, Analytic
 * Findings, Hypotheses, Forecasts, Indicators, Base Rates, Comparisons, Reports) and TOOLS. An entry
 * opens its tab of the open analysis, or the list; Analysis Builder opens the analysis in the
 * Analyst Workbench (024), Workspaces the Workspaces dialog (025) and Saved Views the saved-state
 * dialog (031). One whose screen is built later is shown disabled, naming the prompt.
 */
export function AnalysisRail({
  tab,
  onTab,
  onHome,
  onWorkbench,
  atHome,
  store = appStore,
}: {
  tab?: string;
  onTab?: (tab: string) => void;
  onHome: () => void;
  /** Opens the open analysis in the Analyst Workbench. */
  onWorkbench?: () => void;
  atHome?: boolean;
  /** The store the saved-state dialog opens through (031); the app's by default. */
  store?: Store<AppState>;
}) {
  const workspaces = useWorkspaceSync();
  // Up and down walk the rail's entries (036).
  const onArrow = useArrowNavigation('button');
  const item = (entry: RailEntry) => {
    const Icon = entry.icon;
    // Where two entries open one tab (Indicators opens Hypotheses), the first is the one marked.
    const current = entry.home
      ? atHome
      : !atHome &&
        entry.tab !== undefined &&
        entry.tab === tab &&
        [...ANALYSIS_ENTRIES, ...TOOL_ENTRIES].find((other) => other.tab === tab) === entry;
    const disabled = entry.workbench
      ? !onWorkbench
      : entry.workspaces
        ? !workspaces
        : !entry.home && !entry.saved && (entry.tab === undefined || !onTab);
    return (
      <button
        key={entry.label}
        type="button"
        className={styles.railItem}
        aria-current={current ? 'true' : undefined}
        disabled={disabled}
        title={
          entry.later
            ? `${entry.label}: built in ${entry.later}`
            : disabled
              ? `${entry.label}: open a situation or investigation first`
              : undefined
        }
        onClick={() => {
          if (entry.home) onHome();
          else if (entry.workbench) onWorkbench?.();
          else if (entry.workspaces) workspaces?.openDialog();
          else if (entry.saved) store.set('savedOpen', entry.saved);
          else if (entry.tab) onTab?.(entry.tab);
        }}
      >
        <Icon size={15} aria-hidden="true" />
        {entry.label}
      </button>
    );
  };
  return (
    <nav className={styles.rail} aria-label="Analysis" onKeyDown={onArrow}>
      <h2 className={styles.railHeading}>Analysis</h2>
      {ANALYSIS_ENTRIES.map(item)}
      <h2 className={styles.railHeading}>Tools</h2>
      {TOOL_ENTRIES.map(item)}
    </nav>
  );
}
