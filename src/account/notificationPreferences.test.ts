import { describe, expect, it } from 'vitest';
import { notificationPreference } from '../api/testing/fixtures';
import { toInput } from './notificationPreferences';

describe('toInput', () => {
  it('keeps the id, event types, channel and enabled flag and omits read-only fields', () => {
    const pref = notificationPreference({
      id: '01J0000000000000000000000X',
      eventTypes: ['mention', 'report'],
      channel: {
        type: 'webhook',
        channelId: '00000000-0000-4000-8000-0000000000cc',
        config: { url: 'https://example.test/hook' },
        secretFields: ['token'],
        language: 'en',
      },
      enabled: false,
    });
    expect(toInput(pref)).toEqual({
      id: '01J0000000000000000000000X',
      eventTypes: ['mention', 'report'],
      channel: { type: 'webhook', config: { url: 'https://example.test/hook' }, language: 'en' },
      quietHours: null,
      enabled: false,
    });
  });

  it('does not carry write-only secrets forward (stored secrets are kept server-side)', () => {
    const input = toInput(notificationPreference());
    expect(input.channel).not.toHaveProperty('secrets');
    expect(input.channel).not.toHaveProperty('channelId');
    expect(input.channel).not.toHaveProperty('secretFields');
  });
});
