import {
  Credit,
  DefaultProxy,
  Event,
  GeographicTilingScheme,
  NeverTileDiscardPolicy,
  Rectangle,
  WebMercatorTilingScheme,
  type ImageryProvider,
  type ImageryTypes,
  type TilingScheme,
} from 'cesium';
import type { ForesignalClient } from '../../api/client';
import { MAX_MERCATOR_LATITUDE } from '../records/tileMath';
import { fetchProductTile, type ProductTileTemplate } from './productApi';

/** Turns a fetched image into something Cesium can upload; `createImageBitmap` in the browser. */
export type ImageDecoder = (blob: Blob) => Promise<ImageryTypes>;

/**
 * The browser's decoder, as Cesium's own imagery loader decodes: flipped vertically (WebGL cannot
 * flip an `ImageBitmap` on upload, so Cesium expects it flipped already; unflipped, every tile is
 * drawn upside down within its square), unpremultiplied and without color conversion.
 */
const decodeBitmap: ImageDecoder = (blob) =>
  createImageBitmap(blob, {
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });

/** Most tile requests one provider keeps in flight; Cesium asks again for the rest. */
const MAX_IN_FLIGHT = 8;

/** What a {@link ProductTileProvider} needs. */
export interface ProductTileProviderOptions {
  api: ForesignalClient;
  template: ProductTileTemplate;
  /** The product's native zoom range (`spatial.minZoom`, `spatial.maxZoom`). */
  minimumLevel: number;
  maximumLevel: number;
  /** The frame's (or else the product's) bounds, `[west, south, east, north]`. */
  bounds?: readonly number[] | null;
  /** Told when a tile is fetched and decoded. */
  onTile?: () => void;
  /** Told when a tile fails, with why. */
  onError?: (message: string) => void;
  decode?: ImageDecoder;
}

/**
 * A Cesium imagery provider for one frame of a backend raster product (`getProductTile`), so the
 * frame drapes over the basemap and the terrain like any imagery layer. Every tile goes through
 * the API client, never a bare URL: it carries the client's credentials and is retried on 429 and
 * 503 RENDER_BUSY (002). Levels are WebMercatorQuad zooms of 256-pixel tiles, kept to the
 * product's native range (the backend refuses others with TILE_OUT_OF_RANGE; Cesium magnifies the
 * deepest level beyond it) and to the frame's bounds.
 */
export class ProductTileProvider implements ImageryProvider {
  readonly tilingScheme: TilingScheme = new WebMercatorTilingScheme();
  readonly rectangle: Rectangle;
  readonly tileWidth = 256;
  readonly tileHeight = 256;
  readonly minimumLevel: number;
  readonly maximumLevel: number;
  readonly tileDiscardPolicy = new NeverTileDiscardPolicy() as never;
  readonly errorEvent = new Event();
  readonly credit = undefined as unknown as Credit;
  readonly proxy = new DefaultProxy('');
  readonly hasAlphaChannel = true;
  private inFlight = 0;
  private readonly options: ProductTileProviderOptions;
  private readonly controller = new AbortController();

  /** Creates the provider for one frame's template. */
  constructor(options: ProductTileProviderOptions) {
    this.options = options;
    this.minimumLevel = Math.max(0, options.minimumLevel);
    this.maximumLevel = Math.max(this.minimumLevel, options.maximumLevel);
    this.rectangle = boundsRectangle(options.bounds, this.tilingScheme.rectangle);
  }

  /** No per-tile credits: the product's attribution is shown with the map's (009). */
  getTileCredits(): Credit[] {
    return [];
  }

  /**
   * Fetches and decodes one tile. Returns undefined when {@link MAX_IN_FLIGHT} tiles are already
   * in flight, which Cesium reads as "ask again later". Below the product's minimum zoom it
   * returns nothing to draw (Cesium shows the levels it may fetch instead).
   */
  requestImage(x: number, y: number, level: number): Promise<ImageryTypes> | undefined {
    if (this.inFlight >= MAX_IN_FLIGHT) return undefined;
    this.inFlight++;
    const { api, template, decode = decodeBitmap, onTile, onError } = this.options;
    return fetchProductTile(api, template, { z: level, x, y }, this.controller.signal)
      .then(decode)
      .then((image) => {
        onTile?.();
        return image;
      })
      .catch((error: unknown) => {
        if (!this.controller.signal.aborted) onError?.(String((error as Error)?.message ?? error));
        throw error;
      })
      .finally(() => {
        this.inFlight--;
      });
  }

  /** Product rasters carry no pickable features. */
  pickFeatures(): undefined {
    return undefined;
  }

  /** Cancels the tile requests still in flight. */
  destroy(): void {
    this.controller.abort();
  }
}

/**
 * A rectangle from `[west, south, east, north]` bounds, within the tiling scheme's own (Web
 * Mercator stops at about 85°); the whole scheme without bounds.
 */
export function boundsRectangle(
  bounds: readonly number[] | null | undefined,
  scheme: Rectangle,
): Rectangle {
  if (!bounds || bounds.length !== 4) return Rectangle.clone(scheme);
  const [west, south, east, north] = bounds as [number, number, number, number];
  const clamp = (lat: number) =>
    Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));
  const rectangle = Rectangle.fromDegrees(west, clamp(south), east, clamp(north));
  return Rectangle.intersection(rectangle, scheme) ?? Rectangle.clone(scheme);
}

/**
 * A one-image imagery provider: one loop frame, already projected to latitude/longitude, over its
 * rectangle. Like Cesium's `SingleTileImageryProvider`, but it takes a decoded image, so the image
 * can come through the API client.
 */
export class SingleImageProvider implements ImageryProvider {
  readonly tilingScheme: TilingScheme;
  readonly rectangle: Rectangle;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly minimumLevel = 0;
  readonly maximumLevel = 0;
  readonly tileDiscardPolicy = new NeverTileDiscardPolicy() as never;
  readonly errorEvent = new Event();
  readonly credit = undefined as unknown as Credit;
  readonly proxy = new DefaultProxy('');
  readonly hasAlphaChannel = true;
  private readonly image: ImageryTypes;

  /** Wraps `image`, which covers `rectangle` linearly in longitude and latitude. */
  constructor(image: ImageryTypes, rectangle: Rectangle) {
    this.image = image;
    this.rectangle = rectangle;
    this.tilingScheme = new GeographicTilingScheme({
      rectangle,
      numberOfLevelZeroTilesX: 1,
      numberOfLevelZeroTilesY: 1,
    });
    this.tileWidth = image.width;
    this.tileHeight = image.height;
  }

  /** No per-tile credits. */
  getTileCredits(): Credit[] {
    return [];
  }

  /** The image, for the one tile there is. */
  requestImage(): Promise<ImageryTypes> {
    return Promise.resolve(this.image);
  }

  /** Nothing to pick. */
  pickFeatures(): undefined {
    return undefined;
  }
}
