import {
  Cartesian3,
  Cartographic,
  EllipsoidalOccluder,
  SceneMode,
  SceneTransforms,
  type Viewer,
} from 'cesium';
import { useEffect, useRef } from 'react';
import { describeHit, type RecordHit } from './recordPicking';
import styles from './recordMarker.module.css';

/** Pixels between a point symbol's edge and the selection box. */
const BOX_PADDING = 8;

/** The box drawn around a hit that has no symbol size (a line, an area, a cell). */
const BOX_SIZE = 22;

/** Props for {@link RecordMarker}. */
export interface RecordMarkerProps {
  viewer: Viewer;
  hit: RecordHit;
  /** `selected` draws the box and callout, as the mock marks the selected entity; `hover` the callout only. */
  variant: 'selected' | 'hover';
}

/**
 * Marks a record on the map, as the Global mock marks the selected entity: a thin light cyan box
 * around it and a callout beside it with its title and kind (a hover shows the callout alone). One
 * DOM element follows the record each frame (written straight to its style, without re-rendering
 * React), at the terrain's height in 3D, and hides when the record is behind the globe.
 */
export function RecordMarker({ viewer, hit, variant }: RecordMarkerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const { scene } = viewer;
    const cartographic = Cartographic.fromDegrees(hit.longitude, hit.latitude);
    const position = new Cartesian3();
    const place = () => {
      const element = ref.current;
      if (!element || viewer.isDestroyed()) return;
      const height = scene.mode === SceneMode.SCENE3D ? scene.globe.getHeight(cartographic) : 0;
      Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        height ?? 0,
        scene.globe.ellipsoid,
        position,
      );
      const occluded =
        scene.mode === SceneMode.SCENE3D &&
        !new EllipsoidalOccluder(scene.globe.ellipsoid, scene.camera.positionWC).isPointVisible(
          Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0),
        );
      const screen = occluded
        ? undefined
        : SceneTransforms.worldToWindowCoordinates(scene, position);
      if (!screen) {
        element.style.visibility = 'hidden';
        return;
      }
      element.style.visibility = 'visible';
      element.style.transform = `translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px)`;
    };
    place();
    return scene.postRender.addEventListener(place);
  }, [viewer, hit]);

  const width = (hit.width ?? BOX_SIZE - 2 * BOX_PADDING) + 2 * BOX_PADDING;
  const height = (hit.height ?? BOX_SIZE - 2 * BOX_PADDING) + 2 * BOX_PADDING;
  const { title, detail } = describeHit(hit);
  return (
    <div
      ref={ref}
      className={styles.marker}
      data-testid={variant === 'selected' ? 'selection-marker' : 'hover-marker'}
      data-variant={variant}
      aria-hidden={variant === 'hover'}
    >
      {variant === 'selected' && (
        <div className={styles.box} style={{ width, height, left: -width / 2, top: -height / 2 }} />
      )}
      <div className={styles.callout} style={{ left: width / 2 + 4, top: -height / 2 }}>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}
