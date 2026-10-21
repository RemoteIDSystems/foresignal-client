import type { Change, LiveEvent } from '../api/stream/ChangeStream';
import { EventSubscription, type EventSubscriptionOptions } from '../api/stream/EventSubscription';
import type { SseEvent } from '../api/stream/sse';
import {
  changedArea,
  liveArea,
  type ChangedArea,
  type LiveAreaHandlers,
  type LiveAreaSource,
} from '../map/records/liveChanges';
import { viewLayerId } from '../map/records/viewLayers';

/** What a saved view's stream needs besides the view: the connection settings. */
export type ViewStreamOptions = Omit<EventSubscriptionOptions, 'path' | 'onEvent' | 'onState'>;

/**
 * A saved view's own live stream (`streamView`, 031): the changes and live positions of the
 * records its predicate matches, the backend having done the matching. Each one is handed on as an
 * area of the view's layer (`view:<id>`), so the tiles it touches are fetched again; a resync or
 * reset reloads the layer. The connection is open only while something listens, and resumes from
 * the last event id.
 */
export class SavedViewStream implements LiveAreaSource {
  private readonly listeners = new Set<LiveAreaHandlers>();
  private readonly subscription: EventSubscription;
  private readonly layer: string;

  /**
   * @param viewId The saved view.
   * @param options The connection settings (base URL, token, tickets, transport).
   */
  constructor(
    readonly viewId: string,
    options: ViewStreamOptions,
  ) {
    this.layer = viewLayerId(viewId);
    this.subscription = new EventSubscription({
      ...options,
      path: `/v1/views/${encodeURIComponent(viewId)}/stream`,
      onEvent: (event) => this.onEvent(event),
    });
  }

  /** Hands the view's changed areas to `handlers` until the returned function is called. */
  listen(handlers: LiveAreaHandlers): () => void {
    this.listeners.add(handlers);
    if (this.listeners.size === 1) this.subscription.start();
    return () => {
      this.listeners.delete(handlers);
      if (this.listeners.size === 0) this.subscription.stop();
    };
  }

  private onEvent(event: SseEvent): void {
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    let area: ChangedArea | undefined;
    switch (event.event) {
      case 'change':
        area = changedArea(data as Change);
        break;
      case 'live':
        area = liveArea(data as LiveEvent);
        break;
      case 'resync':
      case 'reset':
        for (const listener of this.listeners) listener.reload();
        return;
      default:
        return;
    }
    if (!area) return;
    const mine: ChangedArea = { ...area, kind: this.layer };
    for (const listener of this.listeners) listener.areas([mine]);
  }
}
