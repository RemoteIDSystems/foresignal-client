import type { AppState, LayersState, LocateRequest, TimeCursor } from '../state/store';
import { selectionRef } from '../objects/selectObject';
import type { ContextPatch, WorkspaceContext } from './workspaceApi';

/** The prefix that marks a product layer among a context's layer ids. */
export const PRODUCT_LAYER = 'product:';

/** The parts of the app's state a workspace context carries. */
export type BoundState = Pick<AppState, 'selection' | 'viewport' | 'layers' | 'time'>;

/**
 * The context the app is showing, on top of the workspace's own: the selection as the focus, the
 * committed viewport, the layers turned on (kinds, and products as `product:<key>`), the hidden
 * sources as a filter, and the pinned instant. The selected refs and anything the app does not
 * own are kept from `base`. Layers the user has not chosen (the catalog's defaults) leave the
 * context's layers alone.
 */
export function appContext(state: BoundState, base: WorkspaceContext): WorkspaceContext {
  const next: WorkspaceContext = { ...base };
  const focus = selectionRef(state.selection);
  next.focusRef = focus ?? null;
  if (state.viewport) next.viewport = { bbox: [...state.viewport.bbox] };
  if (state.layers.kinds !== undefined || state.layers.products !== undefined) {
    next.layers = [
      ...(state.layers.kinds ?? []),
      ...(state.layers.products ?? []).map((key) => `${PRODUCT_LAYER}${key}`),
    ];
  }
  next.filters = { ...(base.filters ?? {}), hiddenSources: [...state.layers.hiddenSources] };
  next.asOf = state.time.mode === 'asOf' ? state.time.asOf : null;
  return next;
}

/**
 * The JSON merge patch from one context to another: each top-level field that changed, with
 * `null` for one that is gone. Empty when nothing changed.
 */
export function contextPatch(from: WorkspaceContext, to: WorkspaceContext): ContextPatch {
  const patch: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]) as Set<keyof WorkspaceContext>;
  for (const key of keys) {
    const before = JSON.stringify(from[key] ?? null);
    const after = JSON.stringify(to[key] ?? null);
    if (before !== after) patch[key] = to[key] ?? null;
  }
  return patch as ContextPatch;
}

/** Whether a patch changes nothing. */
export function isEmptyPatch(patch: ContextPatch): boolean {
  return Object.keys(patch).length === 0;
}

/** A JSON merge patch (RFC 7396) applied to a value: objects merge, `null` removes, the rest replace. */
export function mergePatch<T>(target: T, patch: unknown): T {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch as T;
  const base: Record<string, unknown> =
    target !== null && typeof target === 'object' && !Array.isArray(target)
      ? { ...(target as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === null) delete base[key];
    else base[key] = mergePatch(base[key], value);
  }
  return base as T;
}

/** What restoring a context does to the app: the layers, the time, where the map goes, the focus. */
export interface Restore {
  layers?: LayersState;
  time: TimeCursor;
  locate?: Omit<LocateRequest, 'at'>;
  focusRef?: string;
}

/** The camera height that shows a box: its larger side, in meters, with a margin, within bounds. */
function heightFor(widthDeg: number, heightDeg: number, latitude: number): number {
  const meters = Math.max(heightDeg, widthDeg * Math.cos((latitude * Math.PI) / 180)) * 111_000;
  return Math.round(Math.min(8_000_000, Math.max(1_000, meters * 1.2)));
}

/**
 * What the app shows for a context: the layers it names (kinds, and `product:` keys), the hidden
 * sources in its filters, the pinned instant (or live), the map moved to its viewport, and its
 * focus selected. A context with no layers leaves the layers as they are.
 */
export function restoreFrom(context: WorkspaceContext): Restore {
  const restore: Restore = {
    time: context.asOf ? { mode: 'asOf', asOf: context.asOf } : { mode: 'live' },
  };
  const hidden = context.filters?.['hiddenSources'];
  const hiddenSources = Array.isArray(hidden)
    ? hidden.filter((value): value is string => typeof value === 'string').sort()
    : [];
  if (context.layers) {
    const products = context.layers
      .filter((id) => id.startsWith(PRODUCT_LAYER))
      .map((id) => id.slice(PRODUCT_LAYER.length))
      .sort();
    const kinds = context.layers.filter((id) => !id.startsWith(PRODUCT_LAYER)).sort();
    restore.layers = { kinds, products, hiddenSources };
  } else if (hiddenSources.length > 0) {
    restore.layers = { hiddenSources };
  }
  const view = context.viewport;
  if (view?.bbox && view.bbox.length === 4) {
    const [west, south, east, north] = view.bbox as [number, number, number, number];
    const width = east >= west ? east - west : east + 360 - west;
    let longitude = west + width / 2;
    if (longitude > 180) longitude -= 360;
    const latitude = (south + north) / 2;
    restore.locate = { longitude, latitude, height: heightFor(width, north - south, latitude) };
  } else if (view?.center && view.center.length === 2) {
    const [longitude, latitude] = view.center as [number, number];
    const radius = view.radiusKm ?? 100;
    restore.locate = { longitude, latitude, height: heightFor(0, (radius * 2) / 111, latitude) };
  }
  if (context.focusRef) restore.focusRef = context.focusRef;
  return restore;
}

/** A deep link's decoded payload (Client-Contract §6): its version, workspace and context. */
export interface DecodedLink {
  v: number;
  ws?: string;
  ctx: WorkspaceContext;
}

/** The `#fs=` payload in a URL fragment, if there is one. */
export function fragmentPayload(hash: string): string | undefined {
  const match = /(?:^#|&)fs=([A-Za-z0-9_-]+)/.exec(hash);
  return match?.[1];
}

/**
 * A deep link's payload decoded: base64url JSON `{"v":1,"ws":…,"ctx":{…}}`. Undefined when it is
 * not that.
 */
export function decodeLink(payload: string): DecodedLink | undefined {
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Partial<DecodedLink>;
    if (value.v !== 1 || !value.ctx || typeof value.ctx !== 'object') return undefined;
    return {
      v: 1,
      ctx: value.ctx,
      ...(typeof value.ws === 'string' && { ws: value.ws }),
    };
  } catch {
    return undefined;
  }
}

/** A shareable URL for a link: this page's address with the link's fragment in place of any other. */
export function linkUrl(
  location: { origin: string; pathname: string; search: string },
  fragment: string,
) {
  const hash = fragment.startsWith('#') ? fragment : `#${fragment}`;
  return `${location.origin}${location.pathname}${location.search}${hash}`;
}

/** The layout this client keeps on a workspace: the panels closed on the dashboard. */
export interface WorkspaceLayout {
  v: 1;
  closedPanels: string[];
}

/** The layout to store for the app's state. */
export function layoutOf(closedPanels: readonly string[]): WorkspaceLayout {
  return { v: 1, closedPanels: [...closedPanels].sort() };
}

/** The closed panels a stored layout names; none when the layout is not this client's. */
export function closedPanelsFrom(layout: unknown): string[] {
  if (!layout || typeof layout !== 'object') return [];
  const { v, closedPanels } = layout as Partial<WorkspaceLayout>;
  if (v !== 1 || !Array.isArray(closedPanels)) return [];
  return closedPanels.filter((id): id is string => typeof id === 'string').sort();
}
