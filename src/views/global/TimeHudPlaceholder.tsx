import { PLACEHOLDER_HUD } from './placeholderData';
import styles from './GlobalDashboard.module.css';

/**
 * The time HUD over the map: current time, live state and the −24h…+24h scrubber. Placeholder
 * until prompt 013 wires the time machine.
 */
export function TimeHudPlaceholder() {
  return (
    <>
      <div className={styles.hudTime}>
        <div className={styles.hudTimeRow}>
          <span className={styles.hudBox}>{PLACEHOLDER_HUD.time}</span>
          <span className={styles.live}>◆ LIVE</span>
        </div>
        <div className={styles.scrubber} aria-label="Time scrubber (placeholder)">
          <div className={styles.scrubberTrack}>
            <span className={styles.scrubberThumb} />
          </div>
          <div className={styles.scrubberLabels}>
            <span>-24h</span>
            <span>-6h</span>
            <span>Now</span>
            <span>+6h</span>
            <span>+24h</span>
          </div>
        </div>
      </div>
      <div className={styles.placeholderChip}>Placeholder panel data</div>
    </>
  );
}
