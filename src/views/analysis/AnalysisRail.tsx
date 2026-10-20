import { ANALYSIS_ENTRIES, TOOL_ENTRIES, type RailEntry } from './frame';
import styles from './Analysis.module.css';

/**
 * The full-analysis left rail (019), as the Conflict mock draws it: ANALYSIS (Situations, Analytic
 * Findings, Hypotheses, Forecasts, Indicators, Base Rates, Comparisons, Reports) and TOOLS. An entry
 * opens its tab of the open analysis, or the list; one whose screen is built later is shown
 * disabled, naming the prompt.
 */
export function AnalysisRail({
  tab,
  onTab,
  onHome,
  atHome,
}: {
  tab?: string;
  onTab?: (tab: string) => void;
  onHome: () => void;
  atHome?: boolean;
}) {
  const item = (entry: RailEntry) => {
    const Icon = entry.icon;
    const current = entry.home ? atHome : !atHome && entry.tab !== undefined && entry.tab === tab;
    const disabled = !entry.home && (entry.tab === undefined || !onTab);
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
        onClick={() => (entry.home ? onHome() : entry.tab && onTab?.(entry.tab))}
      >
        <Icon size={15} aria-hidden="true" />
        {entry.label}
      </button>
    );
  };
  return (
    <nav className={styles.rail} aria-label="Analysis">
      <h2 className={styles.railHeading}>Analysis</h2>
      {ANALYSIS_ENTRIES.map(item)}
      <h2 className={styles.railHeading}>Tools</h2>
      {TOOL_ENTRIES.map(item)}
    </nav>
  );
}
