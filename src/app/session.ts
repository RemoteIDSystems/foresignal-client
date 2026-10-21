import {
  createForesignalClient,
  unwrap,
  type ForesignalClient,
  type ForesignalClientOptions,
} from '../api/client';
import { createTokenStore, type TokenStore } from '../api/auth';
import { createTicketSource, type TicketSource } from '../api/tickets';
import { ChangeStream } from '../api/stream/ChangeStream';
import { connectStreamToStore } from '../state/liveDeltas';
import { appStore, createStore, INITIAL_STATE, type AppState, type Store } from '../state/store';
import { describeDevice, getDeviceId } from '../lib/deviceId';
import { baseUrl } from '../lib/config';
import {
  capabilitiesStore,
  createCapabilitiesStore,
  type CapabilitiesStore,
} from '../state/capabilities';
import specVersionRaw from '../../openapi/VERSION?raw';
import { WorkspaceSync } from '../workspace/WorkspaceSync';

/** `info.version` of the vendored spec, from `openapi/VERSION`. */
export const SPEC_VERSION = specVersionRaw.trim();

/** Everything the app needs to talk to the backend, built once. */
export interface Session {
  /** The persisted bearer token. */
  tokens: TokenStore;
  /** The typed API client; sends the token and device id as each operation requires. */
  api: ForesignalClient;
  /** `?ticket=` credentials for streams and tiles. */
  tickets: TicketSource;
  /** The backend's capabilities, reloaded whenever the token changes. */
  capabilities: CapabilitiesStore;
  /** The page's one live stream (011); opened while a view holds it. */
  stream: ChangeStream;
  /** The app's state (012): the map and panels read it; the live stream writes into it. */
  store: Store<AppState>;
  /** Binds the app's state to a workspace's context, and restores deep links (025). */
  workspaces: WorkspaceSync;
  /** Reports this browser's device metadata for the current token; resolves `false` with none. */
  reportDevice(): Promise<boolean>;
}

/** Overrides for {@link createSession}; the defaults are the app's real configuration. */
export interface SessionOptions {
  /** Backend base URL; defaults to `VITE_FORESIGNAL_BASE_URL` (or `/`). */
  baseUrl?: string;
  /** Retry settings passed to the API client. */
  retry?: ForesignalClientOptions['retry'];
  /** Use fresh capabilities and app stores instead of the app-wide ones (tests). */
  isolated?: boolean;
}

/**
 * Builds the session: token store, API client, ticket source, live stream, app store (with the
 * stream's deltas applied to it), workspace binding and capabilities.
 *
 * Capabilities load immediately and again on every token change; when a token is present its
 * device metadata is reported with `updateCurrentTokenDevice` (`PUT /v1/tokens/current/device`).
 */
export function createSession(options: SessionOptions = {}): Session {
  const tokens = createTokenStore();
  const api = createForesignalClient({
    baseUrl: options.baseUrl ?? baseUrl,
    getToken: tokens.get,
    getDeviceId,
    retry: options.retry,
  });
  const capabilities = options.isolated ? createCapabilitiesStore() : capabilitiesStore;
  const store = options.isolated ? createStore<AppState>(INITIAL_STATE) : appStore;
  const tickets = createTicketSource(api, { getToken: tokens.get });
  const stream = new ChangeStream({
    api,
    baseUrl: options.baseUrl ?? baseUrl,
    getToken: tokens.get,
    tickets,
  });
  connectStreamToStore(stream, store);
  const workspaces = new WorkspaceSync(api, store);

  const reportDevice = async () => {
    if (!tokens.get()) return false;
    await unwrap(api.PUT('/v1/tokens/current/device', { body: describeDevice(__APP_VERSION__) }));
    return true;
  };

  const refresh = () => {
    tickets.invalidate();
    // A new token may see other data: the stream reconnects with a ticket for it.
    stream.reconnectNow();
    void capabilities.load(api, SPEC_VERSION);
    reportDevice().catch((error: unknown) => {
      console.warn('ForeSignal: could not report device metadata for this token.', error);
    });
  };
  tokens.subscribe(refresh);
  refresh();

  return { tokens, api, tickets, capabilities, stream, store, workspaces, reportDevice };
}
