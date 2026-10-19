import { readStored, writeStored } from './storage';

/** The `localStorage` key holding this browser's device id. */
export const DEVICE_ID_STORAGE_KEY = 'foresignal.deviceId';

/** Matches a UUID in its canonical 8-4-4-4-12 hex form. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cached: string | undefined;

/**
 * Returns this browser's device id: a UUID generated once and persisted.
 *
 * The backend uses it (header `Foresignal-Device-Id`) to keep per-device inbox read state when
 * the token carries no device metadata. A stored value that is not a UUID is replaced.
 */
export function getDeviceId(): string {
  if (cached) {
    return cached;
  }
  const stored = readStored(DEVICE_ID_STORAGE_KEY);
  if (stored && UUID.test(stored)) {
    cached = stored;
  } else {
    cached = crypto.randomUUID();
    writeStored(DEVICE_ID_STORAGE_KEY, cached);
  }
  return cached;
}

/** Forgets the in-memory copy so the next call re-reads storage. For tests. */
export function resetDeviceIdCache(): void {
  cached = undefined;
}

/** Device metadata this client reports for its token (the spec's `DeviceInfo`). */
export interface WebDeviceInfo {
  /** Human-readable device label, at most 200 characters. */
  deviceName: string;
  /** Always `web` for this client. */
  platform: 'web';
  /** This build's version, at most 64 characters. */
  appVersion: string;
}

/**
 * Describes this browser as a device: "ForeSignal Client on <platform>".
 *
 * The platform comes from `navigator.userAgentData` when the browser has it, else
 * `navigator.platform`.
 */
export function describeDevice(appVersion: string, nav: Navigator = navigator): WebDeviceInfo {
  const hinted = (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    ?.platform;
  const platform = hinted || nav.platform || 'browser';
  return {
    deviceName: `ForeSignal Client on ${platform}`.slice(0, 200),
    platform: 'web',
    appVersion: appVersion.slice(0, 64),
  };
}
