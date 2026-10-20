import type { Viewer } from 'cesium';
import type { RecordLayerSet } from '../records/recordLayerSet';

/** The map engine the stress harness measures: the viewer and its record layers. */
export interface MapEngine {
  viewer: Viewer;
  layers: RecordLayerSet;
  /** Where a point on the ellipsoid shows on the canvas, in CSS pixels; undefined off screen. */
  toScreen(longitude: number, latitude: number): { x: number; y: number } | undefined;
}

declare global {
  interface Window {
    /** The map engine, in development builds, for the end-to-end checks. */
    __foresignalEngine?: MapEngine;
  }
}

/** Told when the engine appears or goes. */
type Listener = (engine: MapEngine | undefined) => void;

let current: MapEngine | undefined;
const listeners = new Set<Listener>();

/**
 * Where the development stress harness finds the map engine. The record layers bridge registers it
 * in development builds only; production builds never call {@link registerEngine}, so nothing is
 * exposed there.
 */
export const engineProbe = {
  /** The engine registered now, if any. */
  get current(): MapEngine | undefined {
    return current;
  },
  /** Calls `listener` now and whenever the engine changes; returns a function that stops it. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(current);
    return () => listeners.delete(listener);
  },
};

/**
 * Registers the engine (or clears it with undefined), and puts it on `window.__foresignalEngine`
 * for the end-to-end checks, which cannot reach this module's own instance from the page.
 */
export function registerEngine(engine: MapEngine | undefined): void {
  current = engine;
  window.__foresignalEngine = engine;
  for (const listener of listeners) listener(engine);
}
