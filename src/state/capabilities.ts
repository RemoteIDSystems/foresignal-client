import { useSyncExternalStore } from 'react';
import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/** The backend's `getSystem` result: version, features, limits and security posture. */
export type SystemInfo = components['schemas']['SystemInfo'];

/** The backend's `getContract` result: contract, context-schema and deep-link versions. */
export type Contract = components['schemas']['Contract'];

/** The vendored spec version against the version the live backend reports. */
export interface VersionCheck {
  /** `info.version` of `openapi/OpenAPI.json`, recorded in `openapi/VERSION`. */
  expected: string;
  /** The live backend's `apiVersion` (its spec's `info.version`), if it reported one. */
  actual: string | undefined;
  /** True when the two differ or the backend reported none. */
  mismatch: boolean;
}

/** What the client knows about the backend it talks to. */
export type Capabilities =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; system: SystemInfo; contract: Contract; version: VersionCheck };

/** Compares the vendored spec version with the backend's reported `apiVersion`. */
export function checkVersion(expected: string, system: SystemInfo): VersionCheck {
  const actual = system.apiVersion;
  return { expected, actual, mismatch: actual !== expected };
}

/** A subscribable holder for {@link Capabilities}. */
export interface CapabilitiesStore {
  /** The current snapshot. */
  get(): Capabilities;
  /** Calls `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /**
   * Fetches `getSystem` (`GET /v1/system`) and `getContract` (`GET /v1/contract`) and publishes
   * the result, or the error. Safe to call again (e.g. after the token changes).
   */
  load(client: ForesignalClient, expectedVersion: string): Promise<void>;
}

/** Creates an empty {@link CapabilitiesStore} in the `loading` state. */
export function createCapabilitiesStore(): CapabilitiesStore {
  let snapshot: Capabilities = { status: 'loading' };
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: Capabilities) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load(client, expectedVersion) {
      const mine = ++generation;
      try {
        const [system, contract] = await Promise.all([
          unwrap(client.GET('/v1/system')),
          unwrap(client.GET('/v1/contract')),
        ]);
        if (mine === generation) {
          publish({
            status: 'ready',
            system,
            contract,
            version: checkVersion(expectedVersion, system),
          });
        }
      } catch (error) {
        if (mine === generation) publish({ status: 'error', error });
      }
    },
  };
}

/** The app-wide capabilities store, loaded at startup. */
export const capabilitiesStore = createCapabilitiesStore();

/** Subscribes a component to the backend's capabilities (features, limits, versions). */
export function useCapabilities(store: CapabilitiesStore = capabilitiesStore): Capabilities {
  return useSyncExternalStore(store.subscribe, store.get);
}
