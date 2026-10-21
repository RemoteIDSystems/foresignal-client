import type { SseFailure, SseHandlers, SseTransport } from '../../api/stream/sse';
import type { Alert, Badge, InboxItem } from '../alertApi';

/** An alert as the backend gives it, firing unless `extra` says otherwise. */
export function alert(id: number, extra: Partial<Alert> = {}): Alert {
  return {
    id,
    ruleId: '7b0c2c4e-0000-4000-8000-000000000001',
    ruleName: 'Strong earthquakes near the Gulf',
    seq: 1000 + id,
    source: 'usgs-earthquakes',
    externalId: `us7000q${id}`,
    kind: 'earthquake',
    firedAt: `2026-10-20T12:${String(id).padStart(2, '0')}:00Z`,
    message: `M5.${id} earthquake, 40 km S of Freeport`,
    severity: 'warning',
    rev: id,
    state: 'firing',
    suppressed: false,
    exercise: false,
    ...extra,
  };
}

/** An inbox item as the backend gives it, unread unless `extra` says otherwise. */
export function item(id: number, extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    event: 'alert',
    severity: 'warning',
    title: `Strong earthquakes near the Gulf #${id}`,
    body: `**M5.${id}** earthquake\n\nMore detail`,
    alertId: id,
    createdAt: `2026-10-20T12:${String(id).padStart(2, '0')}:30Z`,
    read: false,
    alertState: 'firing',
    ...extra,
  };
}

/** A badge with `unread` unread, none critical. */
export function badge(unread: number, latestId: number | null = unread, unreadCritical = 0): Badge {
  return { unread, unreadCritical, latestId };
}

/** One connection the fake transport was asked to open. */
export interface FakeConnection {
  url: URL;
  headers: Record<string, string>;
  handlers: SseHandlers;
  closed: boolean;
}

/** A server-sent event source a test drives: it records connections and plays events into them. */
export class FakeSse {
  readonly connections: FakeConnection[] = [];
  readonly transport: SseTransport = ({ url, headers }, handlers) => {
    const connection = { url: new URL(url, 'http://app.test'), headers, handlers, closed: false };
    this.connections.push(connection);
    return () => {
      connection.closed = true;
    };
  };

  /** The newest connection. */
  get last(): FakeConnection {
    return this.connections.at(-1)!;
  }

  /** Opens the newest connection. */
  open(): void {
    this.last.handlers.onOpen();
  }

  /** Sends one event on the newest connection. */
  send(event: string, data: unknown, id?: string): void {
    this.last.handlers.onActivity();
    this.last.handlers.onEvent({
      event,
      data: JSON.stringify(data),
      ...(id !== undefined && { id }),
    });
  }

  /** Ends the newest connection. */
  fail(failure: SseFailure = {}): void {
    this.last.handlers.onClose(failure);
  }
}
