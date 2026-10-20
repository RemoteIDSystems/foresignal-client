import { Cartesian3, Math as CesiumMath, type Billboard } from 'cesium';
import type { RecordFeature } from './decodeTile';
import { resolveSymbol } from './featureStyle';
import type { RecordLayerContext } from './recordLayers';
import { shownRecords } from './recordFilter';
import {
  compareHits,
  hitTest,
  type Pickable,
  type PickQuery,
  type RecordHit,
} from './recordPicking';

/**
 * One step of a history playback on the map (013): the entities as they were at that step, drawn
 * as the record layers draw their tiles' points (the same symbols from the overlay style, into the
 * same shared billboard collection) and picked the same way, so a played record looks and selects
 * like a live one. Each {@link draw} replaces what the step before drew. History frames carry each
 * entity's position, not its full shape, so every record is drawn as a point.
 */
export class FrameLayer {
  private billboards: Billboard[] = [];
  private pickables: Pickable[] = [];

  /** @param context The shared batch, style model and symbol images. */
  constructor(private readonly context: Pick<RecordLayerContext, 'batch' | 'model' | 'images'>) {}

  /**
   * Draws one step's records: those of the layers drawn (`layers`, kinds or sources) and not
   * hidden by the FILTERS tab. Returns how many were drawn per layer.
   */
  draw(
    features: readonly RecordFeature[],
    layers: ReadonlySet<string>,
    hiddenSources: ReadonlySet<string>,
    zoom: number,
  ): Map<string, number> {
    this.clear();
    const counts = new Map<string, number>();
    const { model, images, batch } = this.context;
    for (const feature of shownRecords(features, hiddenSources)) {
      const { properties, geometry } = feature;
      const kind = typeof properties.kind === 'string' ? properties.kind : undefined;
      const layer = kind !== undefined && layers.has(kind) ? kind : feature.layer;
      if (!layers.has(layer) || geometry.type !== 'point') continue;
      const symbol = resolveSymbol(model, feature.layer, properties, 'point', zoom);
      if (symbol?.type !== 'point') continue;
      const image = images.imageFor(symbol.point);
      if (!image) continue;
      const id = {
        layer,
        source: typeof properties.source === 'string' ? properties.source : undefined,
        externalId: typeof properties.externalId === 'string' ? properties.externalId : undefined,
        kind,
      };
      const title = typeof properties.title === 'string' ? properties.title : undefined;
      counts.set(layer, (counts.get(layer) ?? 0) + 1);
      for (const [lon, lat] of geometry.points) {
        const billboard = batch.points.add({
          position: Cartesian3.fromDegrees(lon, lat),
          heightReference: batch.heightReference,
          width: image.width,
          height: image.height,
          id,
        });
        billboard.setImage(image.key, image.canvas);
        const point = symbol.point;
        if (point.type === 'icon' && point.rotation !== undefined) {
          billboard.rotation = -CesiumMath.toRadians(point.rotation);
          if (point.rotationAlignment !== 'viewport') billboard.alignedAxis = Cartesian3.UNIT_Z;
        }
        this.billboards.push(billboard);
        this.pickables.push({
          id,
          title,
          shape: { type: 'point', at: [lon, lat], width: image.width, height: image.height },
        });
      }
    }
    return counts;
  }

  /** Records drawn now. */
  get count(): number {
    return this.billboards.length;
  }

  /** The drawn records under the pointer, topmost first. */
  pick(query: PickQuery): RecordHit[] {
    const hits: RecordHit[] = [];
    for (const pickable of this.pickables) {
      const hit = hitTest(pickable, query);
      if (hit) hits.push(hit);
    }
    return hits.sort(compareHits);
  }

  /** Removes everything drawn. */
  clear(): void {
    for (const billboard of this.billboards) this.context.batch.points.remove(billboard);
    this.billboards = [];
    this.pickables = [];
  }
}
