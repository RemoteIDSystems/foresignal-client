import type { ForesignalClient } from './client';
import { unwrap } from './client';
import type { components } from './generated/schema';

/** A minted ticket (the spec's `StreamTicket`). */
export type StreamTicket = components['schemas']['StreamTicket'];

/** What a ticket is for: SSE streams or map tiles. */
export type TicketPurpose = StreamTicket['purpose'];

/** Settings for {@link createTicketSource}. */
export interface TicketSourceOptions {
  /** Returns the current bearer token; tickets need one even when reads are open. */
  getToken: () => string | null;
  /** Lifetime requested for tile tickets (spec default 10m, max 1h). */
  tileTtl?: string;
  /** A cached tile ticket is replaced this many milliseconds before it expires. Default 30 s. */
  refreshMarginMs?: number;
  /** Current time in milliseconds; replaceable in tests. */
  now?: () => number;
}

/**
 * Supplies `?ticket=` credentials for URLs that cannot carry an `Authorization` header
 * (`EventSource`, map tile loaders), via `createStreamTicket` (`POST /v1/stream-tickets`).
 */
export interface TicketSource {
  /**
   * Returns a tile ticket, reusing a cached one until shortly before it expires; `null` with no
   * token (open reads need no ticket). Tile tickets are reusable until expiry.
   */
  tileTicket(): Promise<string | null>;
  /**
   * Mints a fresh stream ticket for one stream connection; `null` with no token. Never cached:
   * the backend allows one concurrent stream per stream ticket.
   */
  streamTicket(): Promise<string | null>;
  /** Drops the cached tile ticket, e.g. after a `401`, so the next call mints again. */
  invalidate(): void;
}

/** Creates a {@link TicketSource} that mints tickets with `client`. */
export function createTicketSource(
  client: ForesignalClient,
  options: TicketSourceOptions,
): TicketSource {
  const now = options.now ?? Date.now;
  const margin = options.refreshMarginMs ?? 30_000;
  let tile: { ticket: string; expiresAt: number; token: string } | undefined;
  let pending: Promise<string> | undefined;

  const mint = async (purpose: TicketPurpose, ttl?: string) =>
    unwrap(
      client.POST('/v1/stream-tickets', {
        body: ttl === undefined ? { purpose } : { purpose, ttl },
      }),
    );

  return {
    async tileTicket() {
      const token = options.getToken();
      if (!token) return null;
      if (tile && tile.token === token && tile.expiresAt - margin > now()) {
        return tile.ticket;
      }
      pending ??= mint('tiles', options.tileTtl)
        .then((minted) => {
          tile = { ticket: minted.ticket, expiresAt: Date.parse(minted.expiresAt), token };
          return minted.ticket;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
    async streamTicket() {
      if (!options.getToken()) return null;
      return (await mint('stream')).ticket;
    },
    invalidate() {
      tile = undefined;
    },
  };
}

/**
 * Returns `url` with `ticket` added as the `ticket` query parameter, keeping any existing query
 * and fragment. A `null` ticket returns `url` unchanged. Relative URLs stay relative.
 */
export function withTicket(url: string, ticket: string | null): string {
  if (!ticket) return url;
  const hashAt = url.indexOf('#');
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}ticket=${encodeURIComponent(ticket)}${hash}`;
}
