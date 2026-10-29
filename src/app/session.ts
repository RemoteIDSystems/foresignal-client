import {
  createForesignalClient,
  unwrap,
  type ForesignalClient,
  type ForesignalClientOptions,
} from '../api/client';
import {
  createSessionStore,
  createTokenStore,
  type SessionStore,
  type TokenStore,
} from '../api/auth';
import { createPrincipalStore, type PrincipalStore } from '../api/me';
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
import { AlertFeed } from '../alerts/AlertFeed';
import { InboxFeed } from '../alerts/InboxFeed';
import { WebPush } from '../push/webPush';
import { SavedViewStream } from '../saved/viewStream';

/** `info.version` of the vendored spec, from `openapi/VERSION`. */
export const SPEC_VERSION = specVersionRaw.trim();

/** Everything the app needs to talk to the backend, built once. */
export interface Session {
  /** The persisted pasted API bearer token (`fsr_`/`fsa_`). */
  tokens: TokenStore;
  /** The signed-in session credential (`fss_`), held separately from {@link Session.tokens}. */
  sessions: SessionStore;
  /** The signed-in principal from `getMe`, or `null` when anonymous; read with `useMe()`. */
  principal: PrincipalStore;
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
  /** The open alerts and their live lifecycle (029); started by the app shell. */
  alerts: AlertFeed;
  /** This device's notification inbox and badge (029); started by the app shell. */
  inbox: InboxFeed;
  /** This browser's Web Push subscription (030). */
  push: WebPush;
  /** A saved view's own live stream (031), one per view, open while its layer is drawn. */
  viewStream(viewId: string): SavedViewStream;
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
 * stream's deltas applied to it), workspace binding, alerts and inbox (029), Web Push (030), and capabilities.
 *
 * Capabilities load immediately and again on every token change; when a token is present its
 * device metadata is reported with `updateCurrentTokenDevice` (`PUT /v1/tokens/current/device`).
 */
export function createSession(options: SessionOptions = {}): Session {
  const tokens = createTokenStore();
  const sessions = createSessionStore();
  const principal = createPrincipalStore();
  // The bearer every call carries: a signed-in session is preferred over a pasted API token.
  const getBearer = () => sessions.get()?.token ?? tokens.get();
  // A 401 on a request that carried the current session's bearer drops the app to anonymous,
  // without touching a separately-pasted API token.
  const onUnauthorized = (request: Request) => {
    const current = sessions.get();
    if (current && request.headers.get('Authorization') === `Bearer ${current.token}`) {
      sessions.clear();
    }
  };
  const api = createForesignalClient({
    baseUrl: options.baseUrl ?? baseUrl,
    getToken: getBearer,
    getDeviceId,
    onUnauthorized,
    retry: options.retry,
  });
  const capabilities = options.isolated ? createCapabilitiesStore() : capabilitiesStore;
  const store = options.isolated ? createStore<AppState>(INITIAL_STATE) : appStore;
  const tickets = createTicketSource(api, { getToken: getBearer });
  const stream = new ChangeStream({
    api,
    baseUrl: options.baseUrl ?? baseUrl,
    getToken: getBearer,
    tickets,
  });
  connectStreamToStore(stream, store);
  const workspaces = new WorkspaceSync(api, store);
  const alerts = new AlertFeed({
    api,
    baseUrl: options.baseUrl ?? baseUrl,
    getToken: getBearer,
    tickets,
  });
  const inbox = new InboxFeed({
    api,
    baseUrl: options.baseUrl ?? baseUrl,
    getToken: getBearer,
    getDeviceId,
    tickets,
  });
  const push = new WebPush(api, getBearer);
  const viewStreams = new Map<string, SavedViewStream>();
  const viewStream = (viewId: string) => {
    let stream = viewStreams.get(viewId);
    if (!stream) {
      stream = new SavedViewStream(viewId, {
        baseUrl: options.baseUrl ?? baseUrl,
        getToken: tokens.get,
        tickets,
      });
      viewStreams.set(viewId, stream);
    }
    return stream;
  };

  const reportDevice = async () => {
    if (!tokens.get()) return false;
    await unwrap(api.PUT('/v1/tokens/current/device', { body: describeDevice(__APP_VERSION__) }));
    return true;
  };

  // Rehydrate the signed-in principal from `getMe` while a session is present; otherwise anonymous.
  const refreshPrincipal = () => {
    if (sessions.get()) void principal.load(api);
    else principal.clear();
  };

  const refresh = () => {
    tickets.invalidate();
    // A new credential may see other data: the stream reconnects with a ticket for it.
    stream.reconnectNow();
    // Alerts of private sources, and the inbox, depend on the credential.
    alerts.restart();
    inbox.restart();
    void capabilities.load(api, SPEC_VERSION);
    refreshPrincipal();
    reportDevice().catch((error: unknown) => {
      console.warn('ForeSignal: could not report device metadata for this token.', error);
    });
  };
  // Either credential changing (sign-in/out, paste, or a 401 clearing the session) refreshes all.
  tokens.subscribe(refresh);
  sessions.subscribe(refresh);
  refresh();

  return {
    tokens,
    sessions,
    principal,
    api,
    tickets,
    capabilities,
    stream,
    store,
    workspaces,
    alerts,
    inbox,
    push,
    viewStream,
    reportDevice,
  };
}
