import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import type { Viewer } from 'cesium';
import type { ForesignalClient } from '../../api/client';
import type { ChangeStream } from '../../api/stream/ChangeStream';
import { useCommittedViewport, type ViewportStore } from '../../state/viewport';
import { frameFeedFor, frameFromChange } from './frameFeed';
import type { Product } from './productApi';
import {
  parseProductLayerKey,
  ProductRasterLayer,
  WindBarbLayer,
  WindParticleLayer,
  type ProductLayerStatus,
} from './productLayers';

/** One drawn product layer, whatever it draws. */
type AnyProductLayer = ProductRasterLayer | WindBarbLayer | WindParticleLayer;

/** Props for {@link ProductLayersBridge}. */
export interface ProductLayersBridgeProps {
  api: ForesignalClient;
  /** The product catalog; a key whose product is not in it is not drawn. */
  products: readonly Product[];
  /** The product layers to draw, by key (`productLayerKey`), bottom first. */
  layers: readonly string[];
  /** Raster keys whose loop plays over the committed viewport. */
  looping: ReadonlySet<string>;
  /** The committed viewport, which a playing loop covers. */
  viewport: ViewportStore;
  /** Told when a layer's status changes. */
  onStatus: (key: string, status: ProductLayerStatus) => void;
  /** The live stream, whose `raster-frame` changes swap in each product's new frames (011). */
  stream?: ChangeStream;
}

/**
 * Lives inside the Resium viewer and keeps one layer per enabled product key: a
 * {@link ProductRasterLayer} for a raster (or a wind field's speed raster), a
 * {@link WindBarbLayer} for `id:barbs` and a {@link WindParticleLayer} for `id:particles`. Loops
 * play over the committed viewport and reload when it changes. With the live stream, each
 * `raster-frame` change it announces is handed to the product's layers ({@link frameFeedFor}),
 * which then poll only as a safety net. Renders nothing.
 */
export function ProductLayersBridge({
  api,
  products,
  layers,
  looping,
  viewport,
  onStatus,
  stream,
}: ProductLayersBridgeProps) {
  const { viewer } = useCesium();
  const drawn = useRef(new Map<string, AnyProductLayer>());
  const committed = useCommittedViewport(viewport);

  useEffect(() => {
    if (!viewer) return;
    const current = drawn.current;
    const byId = new Map(products.map((product) => [product.id, product]));
    const wanted = new Set(layers.filter((key) => byId.has(parseProductLayerKey(key).productId)));
    for (const [key, layer] of current) {
      if (!wanted.has(key)) {
        layer.destroy();
        current.delete(key);
      }
    }
    for (const key of wanted) {
      if (current.has(key)) continue;
      const { productId, facet } = parseProductLayerKey(key);
      const product = byId.get(productId)!;
      current.set(
        key,
        create(viewer, api, product, facet, (status) => onStatus(key, status)),
      );
    }
  }, [viewer, api, products, layers, onStatus]);

  useEffect(() => {
    for (const [key, layer] of drawn.current) {
      if (layer instanceof ProductRasterLayer) {
        layer.setLoop(looping.has(key) ? committed : undefined);
      }
    }
  }, [looping, committed, layers, products]);

  useEffect(() => {
    if (!stream) return;
    const feed = frameFeedFor(api);
    const sync = () => {
      feed.live = stream.getStatus().state === 'live';
    };
    sync();
    const stopStatus = stream.subscribeStatus(sync);
    const stopListening = stream.listen({
      changes(changes) {
        for (const change of changes) {
          const frame = frameFromChange(change);
          if (frame) feed.offer(frame);
        }
      },
    });
    return () => {
      stopStatus();
      stopListening();
      feed.live = false;
    };
  }, [api, stream]);

  useEffect(() => {
    const current = drawn.current;
    return () => {
      for (const layer of current.values()) layer.destroy();
      current.clear();
    };
  }, [viewer, api]);

  return null;
}

/** Creates the layer for one facet of a product. */
function create(
  viewer: Viewer,
  api: ForesignalClient,
  product: Product,
  facet: ReturnType<typeof parseProductLayerKey>['facet'],
  onStatus: (status: ProductLayerStatus) => void,
): AnyProductLayer {
  if (facet === 'barbs') return new WindBarbLayer(viewer, api, product, onStatus);
  if (facet === 'particles') return new WindParticleLayer(viewer, api, product, onStatus);
  return new ProductRasterLayer(viewer, api, product, onStatus);
}
