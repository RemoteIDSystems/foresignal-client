import { useEffect } from 'react';
import { useCesium } from 'resium';
import { Cartesian3, Color, type Entity } from 'cesium';
import { outlineParts, type Geometry } from './areaOutline';

/**
 * Draws areas over the map as outlines (a situation's or investigation's footprint, 019): each
 * polygon ring and line as a ground-clamped line, each point as a dot, in `color`. Rendered inside
 * the viewer; removes what it drew when the areas change or it unmounts.
 */
export function AreaOutlines({
  areas,
  color,
}: {
  areas: readonly (Geometry | null | undefined)[];
  color: string;
}) {
  const { viewer } = useCesium();
  useEffect(() => {
    if (!viewer) return;
    const stroke = Color.fromCssColorString(color);
    const added: Entity[] = [];
    for (const area of areas) {
      for (const part of outlineParts(area)) {
        if (part.type === 'point') {
          const [lon, lat] = part.coordinates[0]!;
          added.push(
            viewer.entities.add({
              position: Cartesian3.fromDegrees(lon, lat),
              point: { pixelSize: 9, color: stroke, outlineColor: Color.BLACK, outlineWidth: 1 },
            }),
          );
          continue;
        }
        if (part.coordinates.length < 2) continue;
        added.push(
          viewer.entities.add({
            polyline: {
              positions: Cartesian3.fromDegreesArray(part.coordinates.flat()),
              width: 2,
              material: stroke,
              clampToGround: true,
            },
          }),
        );
      }
    }
    viewer.scene.requestRender();
    return () => {
      if (viewer.isDestroyed()) return;
      for (const entity of added) viewer.entities.remove(entity);
      viewer.scene.requestRender();
    };
  }, [viewer, areas, color]);
  return null;
}
