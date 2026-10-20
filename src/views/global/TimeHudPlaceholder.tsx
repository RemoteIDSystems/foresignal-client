import type { ChangeStream } from '../../api/stream/ChangeStream';
import { LiveBadge } from './LiveBadge';
import { PLACEHOLDER_HUD } from './placeholderData';
import styles from './GlobalDashboard.module.css';

/**
 * The time HUD over the map: current time, live state and the −24h…+24h scrubber. The live badge
 * follows the live stream (011); the rest is a placeholder until prompt 013 wires the time machine.
 */
export function TimeHudPlaceholder({ stream }: { stream?: ChangeStream }) {
  return (
    <>
      <div className={styles.hudTime}>
        <div className={styles.hudTimeRow}>
          <span className={styles.hudBox}>{PLACEHOLDER_HUD.time}</span>
          <LiveBadge stream={stream} />
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
