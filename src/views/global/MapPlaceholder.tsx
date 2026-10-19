import { useState } from 'react';
import {
  Compass,
  Crosshair,
  Layers,
  LayoutGrid,
  Minus,
  Navigation,
  Plus,
  Ruler,
} from 'lucide-react';
import { IconButton } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import { PLACEHOLDER_HUD } from './placeholderData';
import styles from './GlobalDashboard.module.css';

type SceneMode = '2d' | '3d' | 'split';

/** Graticule lines across the placeholder globe, every 30 degrees. */
function Graticule() {
  const lines = [];
  for (let i = 1; i < 6; i++) {
    const ry = 200 * Math.sin((i * Math.PI) / 6);
    lines.push(<ellipse key={`m${i}`} cx="250" cy="250" rx={ry} ry="200" />);
    const y = 250 - 200 * Math.cos((i * Math.PI) / 6);
    const rx = 200 * Math.sin((i * Math.PI) / 6);
    lines.push(<line key={`p${i}`} x1={250 - rx} y1={y} x2={250 + rx} y2={y} />);
  }
  return <g className={styles.graticule}>{lines}</g>;
}

/**
 * The central map region before Cesium arrives (prompt 005): a styled globe placeholder with the
 * HUD slots from the mockup — time and live state, the time scrubber, the 2D/3D/Split toggle,
 * navigation controls, the global-view inset, and the coordinate/scale readout.
 */
export function MapPlaceholder() {
  const [mode, setMode] = useState<SceneMode>('3d');
  return (
    <div className={styles.mapRegion}>
      <svg className={styles.globe} viewBox="0 0 500 500" aria-hidden="true">
        <defs>
          <radialGradient id="fs-globe" cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="#1d3a5c" />
            <stop offset="0.55" stopColor="#0c1f36" />
            <stop offset="1" stopColor="#040b16" />
          </radialGradient>
          <radialGradient id="fs-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0.8" stopColor="#2a7fd4" stopOpacity="0.35" />
            <stop offset="1" stopColor="#2a7fd4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="250" cy="250" r="236" fill="url(#fs-halo)" />
        <circle cx="250" cy="250" r="200" fill="url(#fs-globe)" />
        <Graticule />
      </svg>
      <div className={styles.mapNote}>Map engine mounts here (prompt 005)</div>

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

      <Tabs
        className={styles.sceneToggle}
        label="Scene mode"
        variant="pill"
        value={mode}
        onChange={setMode}
        items={[
          { key: '2d', label: '2D Map' },
          { key: '3d', label: '3D Globe' },
          { key: 'split', label: 'Split' },
        ]}
      />

      <div className={styles.hudControls}>
        <IconButton variant="bordered" label="Reset north" icon={<Navigation size={15} />} />
        <div className={styles.zoomGroup}>
          <IconButton label="Zoom in" icon={<Plus size={15} />} />
          <IconButton label="Zoom out" icon={<Minus size={15} />} />
        </div>
        <IconButton variant="bordered" label="Locate" icon={<Crosshair size={15} />} />
        <IconButton variant="bordered" label="Orientation" icon={<Compass size={15} />} />
        <IconButton variant="bordered" label="Measure" icon={<Ruler size={15} />} />
        <IconButton variant="bordered" label="Base layers" icon={<Layers size={15} />} />
        <IconButton variant="bordered" label="Grid" icon={<LayoutGrid size={15} />} />
      </div>

      <div className={styles.inset}>
        <div className={styles.insetTitle}>Global View</div>
        <div className={styles.insetMap} />
      </div>

      <div className={styles.placeholderChip}>Skeleton · placeholder data</div>

      <div className={styles.coords}>
        <span>LAT {PLACEHOLDER_HUD.lat}</span>
        <span>LON {PLACEHOLDER_HUD.lon}</span>
        <span>ELEV {PLACEHOLDER_HUD.elevation}</span>
        <span className={styles.scale}>
          {PLACEHOLDER_HUD.scale}
          <span className={styles.scaleBar} />
        </span>
      </div>
    </div>
  );
}
