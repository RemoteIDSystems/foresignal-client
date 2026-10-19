import { Crosshair, Minus, Plus } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import {
  formatDegrees,
  formatHeight,
  insetBoxes,
  type DegreeRectangle,
  type ScaleBar,
} from './readout';
import type { SceneModeKey } from './sceneMode';
import styles from './MapHud.module.css';

/** What the HUD shows about the camera. */
export interface CameraState {
  /** Camera latitude, degrees. */
  latitude: number;
  /** Camera longitude, degrees. */
  longitude: number;
  /** Camera height above the ellipsoid, meters. */
  height: number;
  /** Camera heading, degrees clockwise from north. */
  heading: number;
  /** Visible ground rectangle, when the view is on the globe. */
  view?: DegreeRectangle;
  /** Scale bar for the current view, when it can be measured. */
  scale?: ScaleBar;
}

/** Callbacks the HUD's controls drive. */
export interface MapHudActions {
  /** Switches scene mode. */
  onSceneMode: (mode: SceneModeKey) => void;
  /** Turns the camera to face north. */
  onResetNorth: () => void;
  /** Zooms in (`1`) or out (`-1`). */
  onZoom: (direction: 1 | -1) => void;
  /** Returns to the default view. */
  onHome: () => void;
}

/** Props for {@link MapHud}. */
export interface MapHudProps extends MapHudActions {
  /** Current design mode. */
  mode: SceneModeKey;
  /** Camera state, or undefined before the viewer is ready. */
  camera: CameraState | undefined;
  /** West and east level-0 tile URLs for the inset background. */
  insetTiles: [string, string];
}

const INSET_WIDTH = 180;
const INSET_HEIGHT = 90;

/**
 * The map's HUD, drawn as DOM over the canvas (not Cesium widgets): the 2D Map / 3D Globe toggle,
 * compass and zoom, the global-view inset with the visible area, and the lat/lon/elevation
 * readout with a scale bar.
 */
export function MapHud({
  mode,
  camera,
  insetTiles,
  onSceneMode,
  onResetNorth,
  onZoom,
  onHome,
}: MapHudProps) {
  return (
    <>
      <Tabs
        className={styles.sceneToggle}
        label="Scene mode"
        variant="pill"
        value={mode}
        onChange={onSceneMode}
        items={[
          { key: '2d', label: '2D Map' },
          { key: '3d', label: '3D Globe' },
        ]}
      />

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.compass}
          aria-label="Reset north"
          title="Reset north"
          onClick={onResetNorth}
        >
          <span
            className={styles.compassNeedle}
            data-testid="compass-needle"
            style={{ transform: `rotate(${-(camera?.heading ?? 0)}deg)` }}
          >
            N
            <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
              <path d="M4 0 L8 12 L4 9 L0 12 Z" fill="currentColor" />
            </svg>
          </span>
        </button>
        <div className={styles.zoomGroup}>
          <IconButton label="Zoom in" icon={<Plus size={15} />} onClick={() => onZoom(1)} />
          <IconButton label="Zoom out" icon={<Minus size={15} />} onClick={() => onZoom(-1)} />
        </div>
        <IconButton
          variant="bordered"
          label="Home view"
          icon={<Crosshair size={15} />}
          onClick={onHome}
        />
      </div>

      <div className={`${styles.panel} ${styles.inset}`}>
        <div className={styles.insetTitle}>Global View</div>
        <div
          className={styles.insetMap}
          data-testid="inset"
          style={{ backgroundImage: insetTiles.map((url) => `url("${url}")`).join(', ') }}
        >
          {camera?.view
            ? insetBoxes(camera.view, INSET_WIDTH, INSET_HEIGHT).map((box, i) => (
                <span key={i} className={styles.insetBox} data-testid="inset-box" style={box} />
              ))
            : camera && (
                <span
                  className={styles.insetDot}
                  style={{
                    left: ((camera.longitude + 180) / 360) * INSET_WIDTH,
                    top: ((90 - camera.latitude) / 180) * INSET_HEIGHT,
                  }}
                />
              )}
        </div>
      </div>

      <div className={`${styles.panel} ${styles.coords}`} data-testid="camera-readout">
        <span>
          <b>LAT</b>
          <span data-testid="readout-lat">{camera ? formatDegrees(camera.latitude) : '—'}</span>
        </span>
        <span>
          <b>LON</b>
          <span data-testid="readout-lon">{camera ? formatDegrees(camera.longitude) : '—'}</span>
        </span>
        <span>
          <b>ELEV</b>
          <span data-testid="readout-elev">{camera ? formatHeight(camera.height) : '—'}</span>
        </span>
        {camera?.scale && (
          <span className={styles.scale} data-testid="scale">
            {camera.scale.label}
            <span className={styles.scaleBar} style={{ width: camera.scale.pixels }} />
          </span>
        )}
      </div>
    </>
  );
}
