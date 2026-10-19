# 012 — State Store

**Goal.** A small, dependency-free reactive store that the map and panels read from and the live
stream writes into, so components re-render only on the keys they use.

**Read first.** 011-CR; [Architecture.md](../docs/Architecture.md) §6.2. Replaces the local-state
stubs used in 005/007.

**Build.**
- `state/store.ts`: a singleton on React 18+ `useSyncExternalStore` with per-key listeners
  (tear-free). Hooks: `useStoreKey(key)`, `useStoreKeys([...])`.
- Keys: `sceneMode`, `viewport` (bbox+zoom), `layers` (enabled set + per-layer filters),
  `selection` (object ref), `time` (live | asOf cursor), `inbox` (badge), `workspaceContextVersion`.
- A stable merge/equality so a fast delta stream does not force unrelated components to reconcile.
- Wire the 011 stream to apply deltas per key; wire 005 scene toggle, 007/008 layer + viewport
  state, so they read/write the store instead of local state.

**Done when.** Toggling a layer, moving the camera, or receiving a stream delta updates only the
subscribed components (verified by a render-count test); the map and rail read from the store.

**Commit.** `012: State Store`; `completion-reports/012-CR-State-Store.md` (hash + owner questions).
