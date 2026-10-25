import type { ReactNode } from 'react';
import { Crosshair, List, Minus, Plus } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import {
  formatDegrees,
  formatElevation,
  insetBoxes,
  type DegreeRectangle,
  type ScaleBar,
} from './readout';
import type { SceneModeKey } from './sceneMode';
import type { BasemapStyle } from './basemapStyle';
import type { RecordGrouping } from './records/recordGrouping';
import styles from './MapHud.module.css';

/** A point on the ground for the readout. */
export interface GroundPoint {
  /** Latitude, degrees. */
  latitude: number;
  /** Longitude, degrees. */
  longitude: number;
  /** Terrain elevation under the pointer, meters; absent off the map or before terrain loads. */
  elevation?: number;
  /** Whether the point is under the mouse pointer or, with the pointer off the map, the view center. */
  source: 'pointer' | 'center';
}

/** What the HUD shows about the camera and the pointer. */
export interface CameraState {
  /** Latitude of the view center, degrees. */
  latitude: number;
  /** Longitude of the view center, degrees. */
  longitude: number;
  /** Camera height above the ellipsoid, meters. */
  height: number;
  /** Camera heading, degrees clockwise from north. */
  heading: number;
  /** Visible ground rectangle, when the view is on the globe. */
  view?: DegreeRectangle;
  /** Scale bar for the current view, when it can be measured. */
  scale?: ScaleBar;
  /** The readout's ground point, when the pointer or the view center is on the globe. */
  ground?: GroundPoint;
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
  /** Opens or closes the legend; without it the HUD has no legend button. */
  onToggleLegend?: () => void;
  /** Picks the basemap (038); without it the HUD has no basemap toggle. */
  onBasemap?: (style: BasemapStyle) => void;
  /** Picks hexagon cells or individual records; without it the HUD has no grouping toggle. */
  onGrouping?: (grouping: RecordGrouping) => void;
}

/** Props for {@link MapHud}. */
export interface MapHudProps extends MapHudActions {
  /** Current design mode. */
  mode: SceneModeKey;
  /** Camera state, or undefined before the viewer is ready. */
  camera: CameraState | undefined;
  /** West and east level-0 tile URLs for the inset background. */
  insetTiles: [string, string];
  /** Whether the legend is open, for the legend button's pressed state. */
  legendOpen?: boolean;
  /** Drawn over the global-view inset, under the visible area (018's activity heat). */
  insetOverlay?: ReactNode;
  /** The basemap picked, for the basemap toggle; Map by default. */
  basemap?: BasemapStyle;
  /** The grouping picked, for the grouping toggle; Hexagons by default. */
  grouping?: RecordGrouping;
}

/** Why the elevation readout shows a dash: elevation is read only under the pointer. */
function elevationNote(ground: GroundPoint): string | undefined {
  if (ground.elevation !== undefined) return undefined;
  return ground.source === 'pointer'
    ? 'Terrain under the pointer has not loaded yet'
    : 'Point at the map to read ground elevation';
}

const INSET_WIDTH = 180;
const INSET_HEIGHT = 90;

/**
 * The map's HUD, drawn as DOM over the canvas (not Cesium widgets): down the right edge, the
 * Map / Satellite basemap toggle, the Hexagons / Individual grouping toggle and the 2D Map /
 * 3D Globe toggle stacked, then compass and zoom, the legend button, the global-view inset with the visible area, and the
 * lat/lon/elevation readout with a scale bar.
 */
export function MapHud({
  mode,
  camera,
  insetTiles,
  onSceneMode,
  onResetNorth,
  onZoom,
  onHome,
  onToggleLegend,
  legendOpen = false,
  insetOverlay,
  basemap = 'map',
  onBasemap,
  grouping = 'hexagons',
  onGrouping,
}: MapHudProps) {
  const ground = camera?.ground;
  return (
    <>
      <div className={styles.rightRail}>
        <div className={styles.toggles}>
          {onBasemap && (
            <Tabs
              label="Basemap"
              variant="pill"
              value={basemap}
              onChange={onBasemap}
              items={[
                { key: 'map', label: 'Map' },
                { key: 'satellite', label: 'Satellite' },
              ]}
            />
          )}
          {onGrouping && (
            <Tabs
              label="Grouping"
              variant="pill"
              value={grouping}
              onChange={onGrouping}
              items={[
                { key: 'hexagons', label: 'Hexagons' },
                { key: 'individual', label: 'Individual' },
              ]}
            />
          )}
          <Tabs
            label="Scene mode"
            variant="pill"
            value={mode}
            onChange={onSceneMode}
            items={[
              { key: '2d', label: '2D Map' },
              { key: '3d', label: '3D Globe' },
            ]}
          />
        </div>

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
          {onToggleLegend && (
            <IconButton
              variant="bordered"
              label={legendOpen ? 'Hide legend' : 'Show legend'}
              aria-pressed={legendOpen}
              icon={<List size={15} />}
              onClick={onToggleLegend}
            />
          )}
        </div>
      </div>

      <div className={`${styles.panel} ${styles.inset}`}>
        <div className={styles.insetTitle}>Global View</div>
        <div
          className={styles.insetMap}
          data-testid="inset"
          style={{ backgroundImage: insetTiles.map((url) => `url("${url}")`).join(', ') }}
        >
          {insetOverlay}
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

      <div
        className={`${styles.panel} ${styles.coords}`}
        data-testid="camera-readout"
        data-source={ground?.source}
      >
        <span>
          <b>LAT</b>
          <span data-testid="readout-lat">{ground ? formatDegrees(ground.latitude) : '—'}</span>
        </span>
        <span>
          <b>LON</b>
          <span data-testid="readout-lon">{ground ? formatDegrees(ground.longitude) : '—'}</span>
        </span>
        <span title={ground && elevationNote(ground)}>
          <b>ELEV</b>
          <span data-testid="readout-elev">
            {ground?.elevation !== undefined ? formatElevation(ground.elevation) : '—'}
          </span>
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
