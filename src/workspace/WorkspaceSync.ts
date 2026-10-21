import type { ForesignalClient } from '../api/client';
import { FsError } from '../api/errors';
import { hitForRef } from '../objects/selectObject';
import type { ActiveWorkspace, AppState, Store } from '../state/store';
import {
  createContextLink,
  createWorkspace,
  getWorkspace,
  patchWorkspaceContext,
  putWorkspaceLayout,
  shareWorkspace,
  type ContextLink,
  type ContextPatch,
  type Workspace,
  type WorkspaceContext,
  type WorkspaceShare,
} from './workspaceApi';
import {
  appContext,
  closedPanelsFrom,
  contextPatch,
  decodeLink,
  fragmentPayload,
  isEmptyPatch,
  layoutOf,
  mergePatch,
  restoreFrom,
  type BoundState,
} from './workspaceContext';

/** How long the app's state must rest before its change is sent, in milliseconds. */
export const SYNC_DEBOUNCE_MS = 800;

/** How many times a stale PATCH is re-read and retried before it gives up. */
export const STALE_ATTEMPTS = 3;

/** How long after a restore the map's first committed view is taken as the context's own. */
export const SETTLE_MS = 5_000;

/** The most selected refs a context holds (Client-Contract §5). */
export const MAX_SELECTED_REFS = 200;

/** Settings for {@link WorkspaceSync}, for tests. */
export interface WorkspaceSyncOptions {
  debounceMs?: number;
  now?: () => number;
}

/** Whether an error is the backend's stale-context answer. */
export function isStale(error: unknown): boolean {
  return (
    error instanceof FsError &&
    error.status === 412 &&
    (error.code === undefined || error.code === 'WORKSPACE_CONTEXT_STALE')
  );
}

/**
 * Binds the app's state to a workspace's context (025). While a workspace is open, a change to the
 * selection, the viewport, the layers or the time is sent, once it rests, as a JSON merge patch with
 * `If-Match` on the version last seen. A stale version (412) is re-read and the same patch sent
 * again on the new version, up to {@link STALE_ATTEMPTS} times; fields another client changed are
 * then shown here, so the next patch does not undo them. Closing or reopening a dashboard panel
 * stores the layout. Opening a workspace, or a deep link, restores its context into the app.
 */
export class WorkspaceSync {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private layoutTimer: ReturnType<typeof setTimeout> | undefined;
  private settleUntil = 0;
  private restoring = false;
  private sending: Promise<unknown> = Promise.resolve();
  private readonly debounceMs: number;
  private readonly now: () => number;
  /** The workspace a deep link named, offered in the Workspaces dialog. */
  linkedWorkspaceId: string | undefined;

  constructor(
    /** The API the binding reads and writes with. */
    readonly api: ForesignalClient,
    private readonly store: Store<AppState>,
    options: WorkspaceSyncOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
    this.now = options.now ?? Date.now;
  }

  /** Starts following the app's state; returns the function that stops it. */
  start(): () => void {
    const keys = ['selection', 'viewport', 'layers', 'time'] as const;
    const stops = keys.map((key) => this.store.subscribe(key, () => this.onAppChange(key)));
    stops.push(this.store.subscribe('closedPanels', () => this.onLayoutChange()));
    return () => {
      stops.forEach((stop) => stop());
      clearTimeout(this.timer);
      clearTimeout(this.layoutTimer);
    };
  }

  /** The workspace open now. */
  get active(): ActiveWorkspace | undefined {
    return this.store.get('workspace');
  }

  /** Opens a workspace: binds to it and shows its context and layout. */
  async open(id: string): Promise<Workspace> {
    const workspace = await getWorkspace(this.api, id);
    this.bind(
      workspace.id,
      workspace.name,
      workspace.contextVersion,
      workspace.context,
      workspace.callerRole,
    );
    // The layout read is the workspace's own: it is not stored back.
    this.restoring = true;
    try {
      this.store.set('closedPanels', closedPanelsFrom(workspace.layout));
    } finally {
      this.restoring = false;
    }
    await this.show(workspace.context, true);
    return workspace;
  }

  /** Creates a workspace from what the app shows now, and binds to it. */
  async create(name: string, investigationId?: string): Promise<Workspace> {
    const context = appContext(this.bound(), {});
    const workspace = await createWorkspace(this.api, name, context, investigationId);
    this.bind(
      workspace.id,
      workspace.name,
      workspace.contextVersion,
      workspace.context,
      workspace.callerRole,
    );
    return workspace;
  }

  /** Stops following the open workspace; the app keeps what it shows. */
  leave(): void {
    clearTimeout(this.timer);
    this.store.set('workspace', undefined);
  }

  /**
   * Adds an object to the open workspace's selected refs (the envelope's add-to-workspace), keeping
   * the last {@link MAX_SELECTED_REFS}. On a stale version the list is read again and the object
   * added to it, so another client's additions stay. Resolves whether it was saved.
   */
  addRef(ref: string): Promise<boolean> {
    if (!this.active) return Promise.reject(new Error('Open a workspace first.'));
    return this.send((context) => {
      const refs = context.selectedRefs ?? [];
      return refs.includes(ref) ? {} : { selectedRefs: [...refs, ref].slice(-MAX_SELECTED_REFS) };
    });
  }

  /**
   * Sends the app's change now, rather than when it rests. On a stale version the same fields are
   * sent again on the new one. Resolves whether it was saved (true when there was nothing to send).
   */
  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const active = this.active;
    if (!active) return Promise.resolve(true);
    const patch = contextPatch(active.context, appContext(this.bound(), active.context));
    return isEmptyPatch(patch) ? Promise.resolve(true) : this.send(() => patch);
  }

  /** Opens the Workspaces dialog. */
  openDialog(): void {
    this.store.set('workspacesOpen', true);
  }

  /** A deep link to what the app shows (`createContextLink`), naming the open workspace. */
  link(): Promise<ContextLink> {
    const active = this.active;
    return createContextLink(this.api, appContext(this.bound(), active?.context ?? {}), active?.id);
  }

  /** A read-only share link to the open workspace (`shareWorkspace`). */
  share(): Promise<WorkspaceShare> {
    const active = this.active;
    if (!active) return Promise.reject(new Error('Open a workspace first.'));
    return shareWorkspace(this.api, active.id);
  }

  /**
   * Restores a deep link in the URL fragment (`#fs=…`), if there is one: its context is shown,
   * and the workspace it names is offered rather than joined, so opening a link never changes a
   * shared workspace. Returns whether there was a link.
   */
  async restoreLink(hash: string): Promise<boolean> {
    const payload = fragmentPayload(hash);
    const link = payload ? decodeLink(payload) : undefined;
    if (!link) return false;
    this.linkedWorkspaceId = link.ws;
    await this.show(link.ctx, true);
    return true;
  }

  /** Shows a context in the app: the layers, time and focus, and (when asked) the map's place. */
  async show(context: WorkspaceContext, moveMap: boolean): Promise<void> {
    const restore = restoreFrom(context);
    this.restoring = true;
    try {
      this.store.batch(() => {
        if (restore.layers) this.store.set('layers', restore.layers);
        this.store.set('time', restore.time);
        if (moveMap && restore.locate)
          this.store.set('locate', { ...restore.locate, at: this.now() });
        if (!restore.focusRef) this.store.set('selection', undefined);
      });
    } finally {
      this.restoring = false;
    }
    if (moveMap) this.settleUntil = this.now() + SETTLE_MS;
    if (restore.focusRef && restore.focusRef !== this.focusOf()) {
      try {
        const hit = await hitForRef(this.api, restore.focusRef);
        this.restoring = true;
        this.store.set('selection', hit);
      } catch {
        // The focus could not be read; the rest of the context is shown.
      } finally {
        this.restoring = false;
      }
    }
  }

  private bound(): BoundState {
    return {
      selection: this.store.get('selection'),
      viewport: this.store.get('viewport'),
      layers: this.store.get('layers'),
      time: this.store.get('time'),
    };
  }

  private focusOf(): string | undefined {
    return appContext(this.bound(), {}).focusRef ?? undefined;
  }

  private bind(
    id: string,
    name: string,
    contextVersion: number,
    context: WorkspaceContext,
    role: string | undefined,
  ): void {
    this.store.set('workspace', {
      id,
      name,
      contextVersion,
      context,
      ...(role !== undefined && { role }),
    });
    this.store.update('workspaceContextVersion', (version) => version + 1);
  }

  private onAppChange(key: 'selection' | 'viewport' | 'layers' | 'time'): void {
    const active = this.active;
    if (!active || this.restoring) return;
    if (key === 'viewport' && this.now() < this.settleUntil) {
      // The map's first view after a restore is the context's own place, seen from here.
      this.settleUntil = 0;
      const viewport = this.store.get('viewport');
      if (viewport) {
        this.store.set('workspace', {
          ...active,
          context: { ...active.context, viewport: { bbox: [...viewport.bbox] } },
        });
      }
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  private onLayoutChange(): void {
    const active = this.active;
    if (!active || this.restoring) return;
    clearTimeout(this.layoutTimer);
    this.layoutTimer = setTimeout(() => {
      const current = this.active;
      if (!current) return;
      putWorkspaceLayout(this.api, current.id, {
        ...layoutOf(this.store.get('closedPanels')),
      }).catch((error: unknown) => this.fail(error));
    }, this.debounceMs);
  }

  /**
   * Sends a patch after any in flight, re-reading and retrying on a stale version. The patch is
   * made from the context last seen, again on each attempt. Resolves whether it was saved.
   */
  private send(make: (context: WorkspaceContext) => ContextPatch): Promise<boolean> {
    const sent = this.sending.then(() => this.sendNow(make));
    this.sending = sent;
    return sent;
  }

  private async sendNow(make: (context: WorkspaceContext) => ContextPatch): Promise<boolean> {
    for (let attempt = 1; ; attempt++) {
      const active = this.active;
      if (!active) return false;
      const patch = make(active.context);
      if (isEmptyPatch(patch)) return true;
      try {
        const state = await patchWorkspaceContext(
          this.api,
          active.id,
          active.contextVersion,
          patch,
        );
        this.adopt(state.contextVersion, state.context, patch);
        return true;
      } catch (error) {
        if (!isStale(error) || attempt >= STALE_ATTEMPTS) {
          this.fail(error);
          return false;
        }
        const fresh = await getWorkspace(this.api, active.id).catch((reread: unknown) => {
          this.fail(reread);
          return undefined;
        });
        if (!fresh) return false;
        this.adopt(fresh.contextVersion, fresh.context, patch);
      }
    }
  }

  /**
   * Takes a context the backend returned (after a patch, or re-read when stale) as the one last
   * seen. Fields another client changed are shown here, without moving the map, with our own
   * patch on top.
   */
  private adopt(version: number, context: WorkspaceContext, ours: ContextPatch | undefined): void {
    const active = this.active;
    if (!active) return;
    // What others changed since the version last seen: not our own fields, nor the map's place.
    const others = contextPatch(active.context, context);
    for (const key of Object.keys(ours ?? {})) delete others[key as keyof ContextPatch];
    delete others.viewport;
    this.store.set('workspace', {
      id: active.id,
      name: active.name,
      ...(active.role !== undefined && { role: active.role }),
      contextVersion: version,
      context,
    });
    this.store.update('workspaceContextVersion', (value) => value + 1);
    // Shown with our own change on top, so a re-read before a retry does not undo it here.
    if (!isEmptyPatch(others)) void this.show(mergePatch(context, ours ?? {}), false);
  }

  private fail(error: unknown): void {
    const active = this.active;
    if (!active) return;
    this.store.set('workspace', {
      ...active,
      error: error instanceof Error ? error.message : 'The workspace was not updated.',
    });
  }
}
