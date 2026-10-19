import { DEVICE_ID_STORAGE_KEY, describeDevice, getDeviceId, resetDeviceIdCache } from './deviceId';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  localStorage.clear();
  resetDeviceIdCache();
});

describe('getDeviceId', () => {
  it('generates a UUID once and persists it', () => {
    const id = getDeviceId();
    expect(id).toMatch(UUID);
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
    resetDeviceIdCache();
    expect(getDeviceId()).toBe(id);
  });

  it('replaces a stored value that is not a UUID', () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, 'not-a-uuid');
    const id = getDeviceId();
    expect(id).toMatch(UUID);
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });
});

describe('describeDevice', () => {
  it('reports platform web with the browser platform in the name', () => {
    const nav = { platform: 'Linux x86_64' } as Navigator;
    expect(describeDevice('0.0.0', nav)).toEqual({
      deviceName: 'ForeSignal Client on Linux x86_64',
      platform: 'web',
      appVersion: '0.0.0',
    });
  });

  it('prefers userAgentData and keeps within the spec limits', () => {
    const nav = { platform: 'x', userAgentData: { platform: 'macOS' } } as unknown as Navigator;
    expect(describeDevice('9'.repeat(100), nav)).toMatchObject({
      deviceName: 'ForeSignal Client on macOS',
      appVersion: '9'.repeat(64),
    });
  });
});
